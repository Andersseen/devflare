/**
 * `X-Hub-Signature-256` verification: HMAC-SHA256 of the *raw* request body
 * with the webhook secret, compared in constant time (`subtle.verify`).
 *
 * Verify the exact bytes GitHub sent — never a re-serialized JSON object,
 * whose whitespace and key order differ from what was signed.
 */

const encoder = new TextEncoder();
const PREFIX = 'sha256=';

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length !== 64 || !/^[0-9a-f]+$/i.test(hex)) return null;
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export async function verifyWebhookSignature(
  secret: string,
  rawBody: string,
  header: string | null | undefined,
): Promise<boolean> {
  if (!secret || !header || !header.startsWith(PREFIX)) return false;
  const signature = hexToBytes(header.slice(PREFIX.length));
  if (!signature) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  return crypto.subtle.verify(
    'HMAC',
    key,
    signature as BufferSource,
    encoder.encode(rawBody),
  );
}

/** Test/support helper: the header GitHub would send for this body. */
export async function signWebhookBody(
  secret: string,
  rawBody: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody)),
  );
  return PREFIX + [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
}
