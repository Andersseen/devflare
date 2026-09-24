import { defineEventHandler } from 'h3';
import { requireSessionUser, userIsAllowed } from '../../../lib/http';

/**
 * GET /api/v1/access — may the signed-in user use connected tools?
 *
 * 401 when anonymous. For a signed-in user, `allowed` is the same server-side
 * decision every connected endpoint enforces on its own — this only lets the
 * page show "access denied" before the user tries something.
 */
export default defineEventHandler(async (event) => {
  const user = await requireSessionUser(event);
  return {
    user: { id: user.id, email: user.email, name: user.name },
    allowed: userIsAllowed(event, user),
  };
});
