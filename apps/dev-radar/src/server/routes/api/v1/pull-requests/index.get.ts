import { defineEventHandler } from 'h3';
import { db } from '../../../../db';
import { requireAllowedUser } from '../../../../lib/http';
import { listPullRequests } from '../../../../lib/store/queries';

/** GET /api/v1/pull-requests — open pull requests across the followed repositories. */
export default defineEventHandler(async (event) => {
  const user = await requireAllowedUser(event);
  return { pullRequests: await listPullRequests(db, user.id) };
});
