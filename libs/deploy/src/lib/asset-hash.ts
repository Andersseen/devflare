/**
 * The content hash Cloudflare Pages identifies an asset by.
 *
 * This is not a hash anyone would guess. It is BLAKE3 — so WebCrypto cannot
 * produce it — computed over the **base64 text** of the file concatenated with
 * the file's extension, then truncated to the first 32 hex characters. Taken
 * from wrangler's own `src/pages/hash.ts`:
 *
 * ```js
 * const contents = fs.readFileSync(filepath);
 * const base64Contents = contents.toString('base64');
 * const extension = path.extname(filepath).substring(1);
 * return blake3.hash(base64Contents + extension).toString('hex').slice(0, 32);
 * ```
 *
 * Getting it wrong fails silently in the worst way: `/pages/assets/check-missing`
 * simply reports every hash as missing, so the deploy still succeeds while
 * re-uploading the entire site every single time. The spec file for this module
 * pins vectors cross-checked against `blake3-wasm`, the exact library wrangler
 * uses, precisely so that failure mode cannot go unnoticed.
 *
 * Working in base64 rather than raw bytes is not a compromise here — it is what
 * both consumers want. The upload endpoint takes base64 too, so a file is read
 * once, encoded once, and the same string is hashed and sent.
 */

import { blake3 } from '@noble/hashes/blake3.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

/** Pages rejects a deployment above this many files. */
export const MAX_ASSET_COUNT = 20_000;

/** Pages rejects any single asset above this size. */
export const MAX_ASSET_SIZE = 25 * 1024 * 1024;

/**
 * The extension of a path, without the leading dot, matching Node's
 * `path.extname(...).substring(1)` — which is what produced the hashes already
 * stored in every Pages project on the account.
 *
 * The case that matters is the dotfile: Node reads a leading dot as the start
 * of the name rather than an extension, so `.gitignore` has no extension at
 * all. A naive `split('.').pop()` would call it `gitignore` and compute a
 * different hash than wrangler for the same bytes.
 */
export function extensionOf(filePath: string): string {
  const base = filePath.slice(filePath.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return '';
  return base.slice(dot + 1);
}

/**
 * @param base64 the file's contents, base64-encoded, exactly as they will be
 *   sent to `/pages/assets/upload`.
 * @param extension the extension without its dot, from {@link extensionOf}.
 */
export function hashAsset(base64: string, extension: string): string {
  return bytesToHex(blake3(utf8ToBytes(base64 + extension))).slice(0, 32);
}

/** Convenience for the common case: hash an asset by its deployment path. */
export function hashAssetAtPath(base64: string, filePath: string): string {
  return hashAsset(base64, extensionOf(filePath));
}
