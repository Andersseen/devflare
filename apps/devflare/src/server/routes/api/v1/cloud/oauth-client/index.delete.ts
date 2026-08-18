import { defineEventHandler } from 'h3';
import { requireCloudAdmin } from '../../../../../lib/cloud-admin';
import {
  clearOAuthClient,
  oauthClientView,
} from '../../../../../lib/cloudflare-oauth-client';

/**
 * DELETE /api/v1/cloud/oauth-client — forget the stored client.
 *
 * Whatever `CLOUDFLARE_OAUTH_CLIENT_ID` / `_SECRET` this deployment carries
 * takes over again, which is why this answers with the resulting view rather
 * than a bare 204: "deleted" and "now running on the environment" are different
 * things to tell the administrator.
 *
 * An existing connection is left alone on purpose. It was granted to the client
 * that made it and keeps working until it expires; deleting a row here must not
 * quietly revoke an account grant.
 */
export default defineEventHandler(async (event) => {
  await requireCloudAdmin(event);

  await clearOAuthClient();

  return oauthClientView(event.context);
});
