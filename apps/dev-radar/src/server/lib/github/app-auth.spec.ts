import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  verify,
} from 'node:crypto';
import { createAppJwt, parsePrivateKey, pkcs1ToPkcs8 } from './app-auth';
import { GitHubConfigError } from './errors';

const pair = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
});
const pkcs8 = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

function decode(part: string) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

function signatureValid(jwt: string, publicKey: string): boolean {
  const [header, payload, signature] = jwt.split('.');
  return verify(
    'RSA-SHA256',
    Buffer.from(`${header}.${payload}`),
    createPublicKey(publicKey),
    Buffer.from(signature, 'base64url'),
  );
}

describe('GitHub App JWT', () => {
  const now = 1_800_000_000;

  it('signs an RS256 JWT from a PKCS#1 key (what GitHub issues)', async () => {
    const jwt = await createAppJwt('12345', pair.privateKey, now);
    const [h, p] = jwt.split('.');
    expect(decode(h)).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(decode(p)).toEqual({ iat: now - 60, exp: now + 540, iss: '12345' });
    expect(signatureValid(jwt, pair.publicKey)).toBe(true);
  });

  it('also accepts a PKCS#8 key', async () => {
    const jwt = await createAppJwt('1', pkcs8.privateKey, now);
    expect(signatureValid(jwt, pkcs8.publicKey)).toBe(true);
  });

  it('accepts the \\n-escaped single-line form env files use', async () => {
    const escaped = pair.privateKey.trim().replace(/\n/g, '\\n');
    const jwt = await createAppJwt('1', escaped, now);
    expect(signatureValid(jwt, pair.publicKey)).toBe(true);
  });

  it('keeps the JWT lifetime under GitHub’s 10 minute limit', async () => {
    const [, p] = (await createAppJwt('1', pair.privateKey, now)).split('.');
    const { iat, exp } = decode(p);
    expect(exp - now).toBeLessThanOrEqual(10 * 60);
    expect(iat).toBeLessThan(now);
  });

  it('rejects junk without echoing it', async () => {
    await expect(createAppJwt('1', 'not a key')).rejects.toBeInstanceOf(
      GitHubConfigError,
    );
    await expect(createAppJwt('1', 'not a key')).rejects.not.toThrow(
      /not a key/,
    );
  });

  it('PKCS#1 -> PKCS#8 wrapping round-trips through the platform parser', () => {
    const { der, format } = parsePrivateKey(pair.privateKey);
    expect(format).toBe('pkcs1');
    const wrapped = Buffer.from(pkcs1ToPkcs8(der));
    expect(wrapped.toString('base64')).toBe(pkcs8Of(pair.privateKey));
  });
});

/** Node's own PKCS#8 export of the same key, for comparison. */
function pkcs8Of(pkcs1Pem: string): string {
  return createPrivateKey(pkcs1Pem)
    .export({ type: 'pkcs8', format: 'der' })
    .toString('base64');
}
