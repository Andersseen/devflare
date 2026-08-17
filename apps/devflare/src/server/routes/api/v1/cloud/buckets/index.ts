import { defineEventHandler } from 'h3';
import { withCloudflare } from '../../../../../lib/cloud-admin';
import { listR2Buckets } from '../../../../../lib/cloudflare';

/**
 * GET /api/v1/cloud/buckets — the R2 buckets on the account.
 *
 * Split out of /api/v1/cloud/storage (spec 008). D1 and KV are lists you read
 * from the outside; a bucket has an inside, and it now has a section of its own
 * to open into.
 */
export default defineEventHandler((event) =>
  withCloudflare(event, async (config, refresh) => {
    const buckets = await listR2Buckets(config, refresh);

    return {
      items: buckets.map((bucket) => ({
        name: bucket.name,
        createdAt: bucket.creation_date,
        location: bucket.location ?? null,
      })),
    };
  }),
);
