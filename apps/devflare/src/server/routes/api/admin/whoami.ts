import { defineEventHandler } from 'h3';
import { getAppSession } from '../../../lib/session';
import {
  callDevAuthAdmin,
  DevAuthAdminError,
} from '../../../lib/devauth-admin';

/**
 * GET /api/admin/whoami — is the current user allowed to administer dev-auth?
 *
 * Asked of dev-auth rather than answered here. DevFlare has no admin list of its
 * own and should not grow one: a copy would be a second thing to keep in step
 * with `ADMIN_EMAILS`, and the UI would eventually show controls the API refuses.
 *
 * Never an error. "Not an admin" is the ordinary answer for most users, and the
 * settings page uses it to decide whether to render the section at all.
 */
export default defineEventHandler(async (event) => {
  const session = await getAppSession(event);
  if (!session) return { admin: false, reason: 'signed-out' };

  try {
    await callDevAuthAdmin(event, session.user.email, '/admin/settings');
    return { admin: true, email: session.user.email };
  } catch (error) {
    if (error instanceof DevAuthAdminError) {
      return {
        admin: false,
        // 503 means this server is misconfigured, not that the user lacks
        // rights; the UI says something different for each.
        reason: error.status === 503 ? 'unavailable' : 'not-admin',
      };
    }
    throw error;
  }
});
