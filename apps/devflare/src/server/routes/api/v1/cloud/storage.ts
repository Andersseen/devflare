import { defineEventHandler } from 'h3';
import { withCloudflare } from '../../../../lib/cloud-admin';
import {
  CloudflareApiError,
  listD1Databases,
  listKvNamespaces,
} from '../../../../lib/cloudflare';

/**
 * GET /api/v1/cloud/storage — the D1 / KV inventory.
 *
 * Each product is a separate token permission, so each is reported separately:
 * a token without KV access should still show the databases rather than turning
 * the whole page into an error.
 *
 * R2 left here in spec 008 and lives under /api/v1/cloud/buckets, because a
 * bucket is the one resource here you can open rather than merely count.
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
    const [d1, kv] = await Promise.all([
      settle(listD1Databases(config, refresh)),
      settle(listKvNamespaces(config, refresh)),
    ]);

    return {
      d1: {
        error: d1.error,
        items: d1.items.map((database) => ({
          id: database.uuid,
          name: database.name,
          createdAt: database.created_at ?? null,
          sizeBytes: database.file_size ?? null,
          // The list endpoint reports `num_tables: 0` for every database — it
          // does not count them, it just sends the zero value. Reported as
          // "unknown" so the UI omits it rather than claiming every database is
          // empty. (`file_size` on the same response is real and varies.)
          tables: database.num_tables ? database.num_tables : null,
        })),
      },
      kv: {
        error: kv.error,
        items: kv.items.map((namespace) => ({
          id: namespace.id,
          name: namespace.title,
        })),
      },
    };
  }),
);
