import { defineEventHandler } from 'h3';
import { db } from '../../../../db';
import { requireAllowedUser } from '../../../../lib/http';
import { listPullRequests } from '../../../../lib/store/queries';

/** GET /api/v1/pull-requests — open pull requests across all repositories. */
export default defineEventHandler(async (event) => {
  await requireAllowedUser(event);
  return { pullRequests: await listPullRequests(db) };
});
