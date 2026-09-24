import { defineEventHandler } from 'h3';
import { getSessionUser } from '../../../lib/session';

/**
 * GET /api/auth/session — the signed-in user from DevTools' own session, in
 * the `{ user }` shape @dev-auth/client's AuthController reads.
 */
export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  return {
    user: user
      ? {
          ...user,
          // DevTools does not track these; the controller expects them.
          emailVerified: false,
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
        }
      : null,
  };
});
