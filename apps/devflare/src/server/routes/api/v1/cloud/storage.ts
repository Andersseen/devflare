import { defineEventHandler } from 'h3';
import { withCloudflare } from '../../../../lib/cloud-admin';
import {
  CloudflareApiError,
  listD1Databases,
  listKvNamespaces,
  listR2Buckets,
} from '../../../../lib/cloudflare';

/**
 * GET /api/v1/cloud/storage — the D1 / KV / R2 inventory.
 *
 * Each product is a separate token permission, so each is reported separately:
 * a token without R2 access should still show the databases rather than turning
 * the whole page into an error.
 */

interface Section<T> {
  items: T[];
  error: string | null;
}

async function settle<T>(load: Promise<T[]>): Promise<Section<T>> {
  try {
    return { items: await load, error: null };
  } catch (error) {
    return {
      items: [],
      error:
        error instanceof CloudflareApiError
          ? error.message
          : 'Could not be read',
    };
  }
}

export default defineEventHandler((event) =>
  withCloudflare(event, async (config, refresh) => {
    const [d1, kv, r2] = await Promise.all([
      settle(listD1Databases(config, refresh)),
      settle(listKvNamespaces(config, refresh)),
      settle(listR2Buckets(config, refresh)),
    ]);

    return {
      d1: {
        error: d1.error,
        items: d1.items.map((database) => ({
          id: database.uuid,
          name: database.name,
          createdAt: database.created_at ?? null,
          sizeBytes: database.file_size ?? null,
          tables: database.num_tables ?? null,
        })),
      },
      kv: {
        error: kv.error,
        items: kv.items.map((namespace) => ({
          id: namespace.id,
          name: namespace.title,
        })),
      },
      r2: {
        error: r2.error,
        items: r2.items.map((bucket) => ({
          name: bucket.name,
          createdAt: bucket.creation_date,
          location: bucket.location ?? null,
        })),
      },
    };
  }),
);
