import { defineEventHandler } from 'h3';
import { requireCloudAdmin } from '../../../../../lib/cloud-admin';
import { clearCloudflareCache } from '../../../../../lib/cloudflare';
import { clearConnection } from '../../../../../lib/cloudflare-connection';

/**
 * DELETE /api/v1/cloud/connect — hands the grant back.
 *
 * Revokes it at Cloudflare and forgets it here. If a `CLOUDFLARE_API_TOKEN` is
 * configured the section keeps working on that afterwards, which is why this
 * answers with what the caller is left with rather than a bare 204.
 */
export default defineEventHandler(async (event) => {
  await requireCloudAdmin(event);

  await clearConnection(event.context);
  clearCloudflareCache();

  return { disconnected: true };
});
