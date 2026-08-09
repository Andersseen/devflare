/**
 * How a registered client's secret is stored and compared.
 *
 * The OAuth provider plugin never sees a plaintext client secret: it is handed
 * an already-stored value and asked to verify a presented one against it, via
 * the `storeClientSecret` option in ../auth.config.ts. Owning both halves here
 * means the format is defined by this file rather than inherited from a library
 * internal that could change under us — the plugin calls `hashClientSecret` and
 * `verifyClientSecret`, and nothing else needs to agree on anything.
 *
 * SHA-256 with no salt or stretching is deliberate and is what the library does
 * by default. Client secrets are 32+ characters of machine-generated entropy
 * (see the README), not human passwords, so there is no dictionary to attack and
 * a slow KDF would only add latency to every token exchange.
 */

const encoder = new TextEncoder();

/** RFC 4648 §5 base64url, unpadded. */
function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** The value stored for a client secret. Never reversible back to the secret. */
export async function hashClientSecret(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  return base64url(new Uint8Array(digest));
}

/**
 * Compares two strings in time independent of how far they match, so a caller
 * cannot learn a stored hash one character at a time from response timing.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  // Both sides are fixed-length SHA-256 digests in practice, so an early return
  // on length leaks nothing about content.
  if (a.length !== b.length) return false;

  let difference = 0;
  for (let i = 0; i < a.length; i++) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return difference === 0;
}

/** Whether `presented` is the secret that `stored` was derived from. */
export async function verifyClientSecret(
  presented: string,
  stored: string,
): Promise<boolean> {
  return constantTimeEqual(await hashClientSecret(presented), stored);
}
