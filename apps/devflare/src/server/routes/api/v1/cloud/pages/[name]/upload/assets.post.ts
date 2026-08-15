import { createError, defineEventHandler, getRouterParam, readBody } from 'h3';
import { withCloudflare } from '../../../../../../../lib/cloud-admin';
import {
  getUploadToken,
  uploadAssetBucket,
  type UploadAsset,
} from '../../../../../../../lib/pages-upload';

/**
 * POST /api/v1/cloud/pages/:name/upload/assets — forward one bucket of assets.
 *
 * The browser has already read, base64-encoded and hashed the files, and packed
 * them into a bucket small enough for one request. This server adds the
 * credential and nothing else: it does no work over the bytes, which is what
 * keeps a Worker's CPU budget out of the picture entirely.
 */
export default defineEventHandler((event) =>
  withCloudflare(event, async (config) => {
    const name = getRouterParam(event, 'name') ?? '';
    if (!name) {
      throw createError({ statusCode: 400, statusMessage: 'Name is required' });
    }

    const body = (await readBody(event)) as { assets?: unknown } | null;
    const assets = body?.assets;

    if (!Array.isArray(assets)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'assets must be an array',
      });
    }

    const malformed = assets.some((asset) => {
      const candidate = asset as Partial<UploadAsset> | null;
      return (
        !candidate ||
        typeof candidate.key !== 'string' ||
        typeof candidate.value !== 'string' ||
        typeof candidate.metadata?.contentType !== 'string'
      );
    });

    if (malformed) {
      throw createError({
        statusCode: 400,
        statusMessage:
          'each asset needs a key, a base64 value and a metadata.contentType',
      });
    }

    const jwt = await getUploadToken(config, name);
    await uploadAssetBucket(jwt, assets as UploadAsset[]);

    return { uploaded: assets.length };
  }),
);
