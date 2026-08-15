/**
 * Packs assets into the batches that each become one upload request.
 *
 * wrangler uses 40 MB buckets. DevFlare uses 15 MB, because the bytes take a
 * different route: wrangler talks to Cloudflare directly, while here every
 * bucket passes through the DevFlare Worker, whose request body limit is
 * 100 MB — and base64 inflates the payload by about a third before it gets
 * there. 15 MB of file becomes roughly 20 MB of JSON, which leaves plenty of
 * headroom and keeps any single request short.
 *
 * The file-count cap is wrangler's own 2,000. One bucket per Worker invocation
 * also means about two subrequests each, comfortably under the 50 a Worker gets
 * on the free plan.
 */

/** ~20 MB once base64-encoded. */
export const MAX_BUCKET_BYTES = 15 * 1024 * 1024;

export const MAX_BUCKET_FILES = 2000;

export interface BucketLimits {
  maxBytes: number;
  maxFiles: number;
}

export const DEFAULT_BUCKET_LIMITS: BucketLimits = {
  maxBytes: MAX_BUCKET_BYTES,
  maxFiles: MAX_BUCKET_FILES,
};

export function packBuckets<T>(
  items: readonly T[],
  sizeOf: (item: T) => number,
  limits: BucketLimits = DEFAULT_BUCKET_LIMITS,
): T[][] {
  const buckets: T[][] = [];
  let current: T[] = [];
  let currentBytes = 0;

  for (const item of items) {
    const size = sizeOf(item);

    // A file larger than the whole bucket budget is still a legal Pages asset
    // (the limit that matters is 25 MiB per file). It gets a bucket to itself
    // rather than being rejected — but it must not first flush an empty one.
    const wouldOverflow =
      current.length > 0 &&
      (currentBytes + size > limits.maxBytes ||
        current.length + 1 > limits.maxFiles);

    if (wouldOverflow) {
      buckets.push(current);
      current = [];
      currentBytes = 0;
    }

    current.push(item);
    currentBytes += size;
  }

  if (current.length > 0) buckets.push(current);

  return buckets;
}
