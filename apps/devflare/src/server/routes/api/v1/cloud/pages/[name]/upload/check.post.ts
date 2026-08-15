import { createError, defineEventHandler, getRouterParam, readBody } from 'h3';
import { withCloudflare } from '../../../../../../../lib/cloud-admin';
import {
  checkMissingHashes,
  getUploadToken,
} from '../../../../../../../lib/pages-upload';

/**
 * POST /api/v1/cloud/pages/:name/upload/check — which of these assets does
 * Cloudflare not already hold?
 *
 * The first step of a direct upload, and the one that makes re-deploying an
 * unchanged site nearly free. The browser sends only hashes here; no file
 * content moves until the answer comes back.
 */
export default defineEventHandler((event) =>
  withCloudflare(event, async (config) => {
    const name = getRouterParam(event, 'name') ?? '';
    if (!name) {
      throw createError({ statusCode: 400, statusMessage: 'Name is required' });
    }

    const body = (await readBody(event)) as { hashes?: unknown } | null;
    const hashes = body?.hashes;

    if (
      !Array.isArray(hashes) ||
      hashes.some((hash) => typeof hash !== 'string')
    ) {
      throw createError({
        statusCode: 400,
        statusMessage: 'hashes must be an array of strings',
      });
    }

    const jwt = await getUploadToken(config, name);
    const missing = await checkMissingHashes(jwt, hashes as string[]);

    return { missing };
  }),
);
