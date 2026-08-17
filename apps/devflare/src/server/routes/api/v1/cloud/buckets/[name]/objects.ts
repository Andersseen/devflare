import { createError, defineEventHandler, getQuery, getRouterParam } from 'h3';
import { withCloudflare } from '../../../../../../lib/cloud-admin';
import { listR2Objects } from '../../../../../../lib/cloudflare';

/**
 * GET /api/v1/cloud/buckets/:name/objects?prefix=&cursor= — one level of one
 * bucket.
 *
 * R2 has no directories. What the UI shows as folders are the key prefixes
 * Cloudflare groups for us when asked with a delimiter, which is why a level is
 * one request rather than a subtree the browser has to assemble.
 */
function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

/** `deploybolt/assets/` → `assets`. The trailing slash is Cloudflare's. */
function folderName(prefix: string): string {
  const trimmed = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  return trimmed.slice(trimmed.lastIndexOf('/') + 1);
}

export default defineEventHandler((event) =>
  withCloudflare(event, async (config) => {
    const bucket = getRouterParam(event, 'name') ?? '';
    if (!bucket) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Bucket name is required',
      });
    }

    const query = getQuery(event);
    const prefix = asString(query['prefix']) ?? '';

    const listing = await listR2Objects(config, bucket, {
      prefix,
      cursor: asString(query['cursor']),
    });

    return {
      prefix,
      folders: listing.folders.map((folder) => ({
        prefix: folder,
        name: folderName(folder),
      })),
      objects: listing.objects.map((object) => ({
        key: object.key,
        // The part below the prefix. The full key stays available because it is
        // what any later download or delete would have to name.
        name: object.key.startsWith(prefix)
          ? object.key.slice(prefix.length)
          : object.key,
        size: object.size,
        lastModified: object.last_modified,
        storageClass: object.storage_class ?? null,
      })),
      cursor: listing.cursor,
    };
  }),
);
