import { GitHubConfigError } from './errors';

/**
 * GitHub App authentication, with WebCrypto only (runs unchanged in Workers).
 *
 *   1. Sign a short-lived App JWT (RS256) with the App's private key.
 *   2. Exchange it for an installation access token (≈1 hour) per sync.
 *
 * The private key and both tokens stay on the server and in memory: never
 * logged, never stored in D1, never sent to the browser.
 */

const encoder = new TextEncoder();

function base64Url(bytes: Uint8Array | string): string {
  const data = typeof bytes === 'string' ? encoder.encode(bytes) : bytes;
  let binary = '';
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function derLength(length: number): number[] {
  if (length < 0x80) return [length];
  const bytes: number[] = [];
  for (let n = length; n > 0; n >>= 8) bytes.unshift(n & 0xff);
  return [0x80 | bytes.length, ...bytes];
}

function der(tag: number, content: Uint8Array): Uint8Array {
  const length = derLength(content.length);
  const out = new Uint8Array(1 + length.length + content.length);
  out[0] = tag;
  out.set(length, 1);
  out.set(content, 1 + length.length);
  return out;
}

/**
 * GitHub issues PKCS#1 keys ("BEGIN RSA PRIVATE KEY"); WebCrypto imports only
 * PKCS#8. Wrapping is a fixed ASN.1 envelope (version 0, rsaEncryption, key).
 */
export function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array {
  const version = new Uint8Array([0x02, 0x01, 0x00]);
  const algorithm = new Uint8Array([
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01,
    0x01, 0x05, 0x00,
  ]);
  const key = der(0x04, pkcs1);
  const body = new Uint8Array(version.length + algorithm.length + key.length);
  body.set(version, 0);
  body.set(algorithm, version.length);
  body.set(key, version.length + algorithm.length);
  return der(0x30, body);
}

/** Accepts real newlines or the `\n` escapes env files and CI secrets use. */
export function parsePrivateKey(pem: string): {
  der: Uint8Array;
  format: 'pkcs1' | 'pkcs8';
} {
  const normalized = pem.replace(/\\n/g, '\n').trim();
  const match = normalized.match(
    /-----BEGIN (RSA PRIVATE KEY|PRIVATE KEY)-----([\s\S]+?)-----END \1-----/,
  );
  if (!match) {
    throw new GitHubConfigError(
      'GITHUB_APP_PRIVATE_KEY is not a PEM private key',
    );
  }
  const body = match[2].replace(/\s+/g, '');
  let binary: string;
  try {
    binary = atob(body);
  } catch {
    throw new GitHubConfigError('GITHUB_APP_PRIVATE_KEY is not valid base64');
  }
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return {
    der: bytes,
    format: match[1] === 'RSA PRIVATE KEY' ? 'pkcs1' : 'pkcs8',
  };
}

async function importSigningKey(pem: string): Promise<CryptoKey> {
  const { der: bytes, format } = parsePrivateKey(pem);
  const pkcs8 = format === 'pkcs1' ? pkcs1ToPkcs8(bytes) : bytes;
  try {
    return await crypto.subtle.importKey(
      'pkcs8',
      pkcs8 as BufferSource,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
  } catch {
    throw new GitHubConfigError('GITHUB_APP_PRIVATE_KEY could not be imported');
  }
}

/**
 * App JWT. GitHub allows at most 10 minutes; `iat` is backdated 60s for clock
 * drift, as GitHub recommends.
 */
export async function createAppJwt(
  appId: string,
  privateKeyPem: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64Url(
    JSON.stringify({
      iat: nowSeconds - 60,
      exp: nowSeconds + 9 * 60,
      iss: appId,
    }),
  );
  const signingInput = `${header}.${payload}`;
  const key = await importSigningKey(privateKeyPem);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    encoder.encode(signingInput),
  );
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
}
