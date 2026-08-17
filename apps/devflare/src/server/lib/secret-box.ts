/**
 * Reversible encryption for the credentials this server has to store rather
 * than hash.
 *
 * A session token is hashed and never recovered (see ./session.ts). A
 * Cloudflare OAuth token cannot work that way: it has to leave here as
 * plaintext on every API call, so it has to be stored reversibly.
 *
 * The trade-off, stated plainly because it is real: a database dump plus
 * `SECRET_ENCRYPTION_KEY` reveals these values, where today a dump alone
 * reveals nothing. What it buys is a credential the owner grants once from a
 * consent screen and this server renews by itself — no `wrangler secret put`
 * per environment, which is the step that has repeatedly been left undone.
 *
 * AES-256-GCM, so a tampered ciphertext fails to open rather than decrypting to
 * something attacker-chosen. The nonce is random per seal and stored alongside;
 * reusing one under the same key is the classic way to break GCM, so it is
 * never derived from anything.
 *
 * Deliberately a sibling of apps/dev-auth/src/lib/secret-box.ts rather than an
 * import of it: the two Workers deploy separately and share no build, and a
 * shared library for eighty lines of Web Crypto would couple the identity
 * provider to this app for no benefit. The format is identical on purpose, so a
 * value sealed by either can be read by the other under the same key.
 */

const IV_BYTES = 12;
const KEY_BYTES = 32;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class SecretBoxError extends Error {}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

/**
 * `TextEncoder` is typed as writing into an arbitrary `ArrayBufferLike`, which
 * Web Crypto's `BufferSource` does not accept. Copying into a plain
 * `ArrayBuffer`-backed view is the narrowing — and it is a copy of a secret
 * either way, so nothing is lost by making it explicit.
 */
function bytesOf(text: string): Uint8Array<ArrayBuffer> {
  const encoded = encoder.encode(text);
  const copy = new Uint8Array(encoded.length);
  copy.set(encoded);
  return copy;
}

/**
 * The key comes from a Worker secret. Accepts base64 (what `openssl rand
 * -base64 32` prints) or raw text, which is hashed to the right length so a
 * hand-typed value still produces a valid key rather than an obscure failure.
 */
async function importKey(rawKey: string): Promise<CryptoKey> {
  if (!rawKey || !rawKey.trim()) {
    throw new SecretBoxError('SECRET_ENCRYPTION_KEY is not set');
  }

  let material: Uint8Array<ArrayBuffer>;
  try {
    const decoded = fromBase64(rawKey.trim());
    material =
      decoded.length === KEY_BYTES
        ? decoded
        : new Uint8Array(
            await crypto.subtle.digest('SHA-256', bytesOf(rawKey)),
          );
  } catch {
    material = new Uint8Array(
      await crypto.subtle.digest('SHA-256', bytesOf(rawKey)),
    );
  }

  return crypto.subtle.importKey('raw', material, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

/** Encrypts `plaintext`, returning `<base64 iv>.<base64 ciphertext>`. */
export async function seal(plaintext: string, rawKey: string): Promise<string> {
  const key = await importKey(rawKey);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    bytesOf(plaintext),
  );

  return `${base64(iv)}.${base64(new Uint8Array(ciphertext))}`;
}

/**
 * Reverses `seal`. Throws on a wrong key or a tampered value rather than
 * returning anything — a caller must never proceed with a half-trusted secret.
 */
export async function open(sealed: string, rawKey: string): Promise<string> {
  const [ivPart, ciphertextPart] = sealed.split('.');
  if (!ivPart || !ciphertextPart) {
    throw new SecretBoxError('sealed value is malformed');
  }

  const key = await importKey(rawKey);
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(ivPart) },
      key,
      fromBase64(ciphertextPart),
    );
    return decoder.decode(plaintext);
  } catch {
    // Deliberately says nothing about which of the two it was.
    throw new SecretBoxError('cannot decrypt: wrong key or altered value');
  }
}
