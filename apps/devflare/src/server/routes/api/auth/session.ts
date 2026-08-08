import { defineEventHandler } from 'h3';
import { getAppSession } from '../../../lib/session';

/**
 * GET /api/auth/session — the current user, from DevFlare's own session.
 *
 * The shape mirrors what better-auth's `get-session` used to return, so the
 * Angular side keeps reading `data.user`.
 */
export default defineEventHandler(async (event) => {
  const session = await getAppSession(event);
  return { user: session?.user ?? null };
});
