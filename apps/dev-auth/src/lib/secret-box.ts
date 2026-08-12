/**
 * Reversible encryption for the few secrets that have to be stored, not hashed.
 *
 * A client secret this service *issues* is hashed and never recovered (see
 * ./client-secret.ts). A credential this service *presents to someone else* —
 * the GitHub OAuth App secret — cannot work that way: it has to leave here as
 * plaintext, so it has to be stored reversibly.
 *
 * The trade-off, stated plainly because it is real: a database dump plus
 * `SECRET_ENCRYPTION_KEY` reveals these values, where today a database dump
 * alone reveals nothing. What it buys is one Worker secret set once, with every
 * other value manageable from the admin API — which is what stops the two halves
 * of a credential drifting apart, the failure that silently broke the imageryx
 * registration.
 *
 * AES-256-GCM, so a tampered ciphertext fails to open rather than decrypting to
 * something attacker-chosen. The nonce is random per seal and stored alongside;
 * reusing one under the same key would be the classic way to break GCM, so it is
 * never derived from anything.
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

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
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

  let material: Uint8Array;
  try {
    const decoded = fromBase64(rawKey.trim());
    material =
      decoded.length === KEY_BYTES
        ? decoded
        : new Uint8Array(
            await crypto.subtle.digest('SHA-256', encoder.encode(rawKey)),
          );
  } catch {
    material = new Uint8Array(
      await crypto.subtle.digest('SHA-256', encoder.encode(rawKey)),
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
    encoder.encode(plaintext),
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
