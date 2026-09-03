/**
 * PKCE and CSRF primitives. Web Crypto only (`crypto.getRandomValues`,
 * `crypto.subtle.digest`) — available as a global in browsers, Cloudflare
 * Workers and Node ≥ 19, so nothing here imports `node:crypto`.
 */

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function randomToken(byteLength = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

/** Opaque value tying a callback to the request that started it (CSRF). */
export const createState = randomToken;

/** PKCE verifier. Kept by the caller (a cookie, typically) and never sent to
 * the provider until the token exchange — the authorization request only ever
 * carries its S256 challenge. */
export const createCodeVerifier = randomToken;

/** S256 challenge for a PKCE verifier. The provider is expected to reject
 * `plain` challenges; this SDK never produces one. */
export async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  );
  return base64Url(new Uint8Array(digest));
}
