import { defineEventHandler } from 'h3';
import { requireCloudAdmin } from '../../../../../lib/cloud-admin';
import { oauthClientView } from '../../../../../lib/cloudflare-oauth-client';

/**
 * GET /api/v1/cloud/oauth-client — which Cloudflare OAuth client this server
 * would connect with, and where it came from.
 *
 * Admin-gated like the rest of /api/v1/cloud/*: it describes how the account
 * credential is configured, which is not something a signed-in user may read.
 * The client secret is never part of the answer, in any form.
 */
export default defineEventHandler(async (event) => {
  await requireCloudAdmin(event);

  return oauthClientView(event.context);
});
