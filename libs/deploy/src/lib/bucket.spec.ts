import { describe, expect, it } from 'vitest';
import {
  MAX_BUCKET_BYTES,
  MAX_BUCKET_FILES,
  packBuckets,
  type BucketLimits,
} from './bucket';

const sizeOf = (item: { size: number }) => item.size;
const items = (...sizes: number[]) => sizes.map((size) => ({ size }));
const limits = (maxBytes: number, maxFiles = 100): BucketLimits => ({
  maxBytes,
  maxFiles,
});

describe('packBuckets', () => {
  it('returns nothing for no items', () => {
    expect(packBuckets([], sizeOf)).toEqual([]);
  });

  it('keeps everything in one bucket when it fits', () => {
    const input = items(10, 20, 30);
    expect(packBuckets(input, sizeOf, limits(100))).toEqual([input]);
  });

  it('splits on the byte cap', () => {
    const result = packBuckets(items(60, 60, 10), sizeOf, limits(100));
    expect(result.map((b) => b.map(sizeOf))).toEqual([[60], [60, 10]]);
  });

  it('splits on the file-count cap', () => {
    const result = packBuckets(items(1, 1, 1, 1, 1), sizeOf, limits(1000, 2));
    expect(result.map((b) => b.length)).toEqual([2, 2, 1]);
  });

  it('gives an oversized file its own bucket without emitting an empty one', () => {
    // Legal for Pages (the real per-file limit is 25 MiB) but bigger than a
    // whole bucket budget. It must not flush an empty bucket ahead of itself.
    const result = packBuckets(items(500), sizeOf, limits(100));
    expect(result.map((b) => b.map(sizeOf))).toEqual([[500]]);
    expect(result.every((b) => b.length > 0)).toBe(true);
  });

  it('does not let an oversized file drag its neighbours along', () => {
    const result = packBuckets(items(10, 500, 10), sizeOf, limits(100));
    expect(result.map((b) => b.map(sizeOf))).toEqual([[10], [500], [10]]);
  });

  it('never exceeds either cap, except for a single oversized item', () => {
    const sizes = Array.from({ length: 200 }, (_, i) => ((i * 37) % 40) + 1);
    const result = packBuckets(items(...sizes), sizeOf, limits(100, 7));

    for (const bucket of result) {
      expect(bucket.length).toBeLessThanOrEqual(7);
      const total = bucket.reduce((sum, item) => sum + item.size, 0);
      if (bucket.length > 1) expect(total).toBeLessThanOrEqual(100);
    }
    expect(result.flat()).toHaveLength(200);
  });

  it('preserves order across buckets', () => {
    const input = items(...Array.from({ length: 50 }, (_, i) => i + 1));
    const result = packBuckets(input, sizeOf, limits(60, 5));
    expect(result.flat()).toEqual(input);
  });

  it('ships defaults sized for the Worker request limit', () => {
    // 15 MB of file becomes ~20 MB of base64 JSON, well under the Worker's
    // 100 MB body cap.
    expect(MAX_BUCKET_BYTES).toBe(15 * 1024 * 1024);
    expect(MAX_BUCKET_FILES).toBe(2000);
  });
});
