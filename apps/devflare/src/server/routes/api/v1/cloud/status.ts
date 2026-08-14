import { defineEventHandler } from 'h3';
import { getAppSession } from '../../../../lib/session';
import { cloudAdminVerdict } from '../../../../lib/cloud-admin';
import { isCloudflareConfigured } from '../../../../lib/cloudflare';

/**
 * GET /api/v1/cloud/status — may I see the Cloud section, and is there an
 * account wired up behind it?
 *
 * Never an error, in the spirit of /api/admin/whoami: "no token yet" and "not an
 * administrator" are ordinary answers, and the UI needs to tell them apart to
 * show either a connect prompt or nothing at all.
 */
export default defineEventHandler(async (event) => {
  const session = await getAppSession(event);
  if (!session) {
    return { admin: false, configured: false, reason: 'signed-out' as const };
  }

  const verdict = await cloudAdminVerdict(event, session.user.email);
  if (verdict !== 'admin') {
    return { admin: false, configured: false, reason: verdict };
  }

  return {
    admin: true,
    configured: isCloudflareConfigured(event.context),
    reason: 'ok' as const,
  };
});
