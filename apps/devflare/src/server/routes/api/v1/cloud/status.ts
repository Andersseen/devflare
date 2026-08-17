import { defineEventHandler } from 'h3';
import { getAppSession } from '../../../../lib/session';
import { cloudAdminVerdict } from '../../../../lib/cloud-admin';
import {
  cloudflareConnectionState,
  NO_CONNECTION,
} from '../../../../lib/cloudflare-connection';

/**
 * GET /api/v1/cloud/status — may I see the Cloud section, is there an account
 * wired up behind it, and can I connect one from here?
 *
 * Never an error, in the spirit of /api/admin/whoami: "not connected yet" and
 * "not an administrator" are ordinary answers, and the UI needs to tell them
 * apart to show either a connect prompt or nothing at all.
 *
 * Non-administrators are told nothing about how the server is configured —
 * `canConnect` stays false for them regardless, since the answer would only
 * describe a flow they may not start.
 */
export default defineEventHandler(async (event) => {
  const session = await getAppSession(event);
  if (!session) {
    return {
      admin: false,
      configured: false,
      canConnect: false,
      connection: NO_CONNECTION,
      reason: 'signed-out' as const,
    };
  }

  const verdict = await cloudAdminVerdict(event, session.user.email);
  if (verdict !== 'admin') {
    return {
      admin: false,
      configured: false,
      canConnect: false,
      connection: NO_CONNECTION,
      reason: verdict,
    };
  }

  const state = await cloudflareConnectionState(event.context);

  return {
    admin: true,
    configured: state.configured,
    canConnect: state.canConnect,
    connection: state.connection,
    reason: 'ok' as const,
  };
});
