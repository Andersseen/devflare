import { defineEventHandler, getQuery } from 'h3';
import { db } from '../../../../db';
import { requireAllowedUser } from '../../../../lib/http';
import { listRepositories } from '../../../../lib/store/queries';

/**
 * GET /api/v1/repositories — the repositories the signed-in user follows.
 * `?scope=available` lists everything the GitHub App installation can read
 * (each flagged `followed`), for Manage repositories.
 */
export default defineEventHandler(async (event) => {
  const user = await requireAllowedUser(event);
  const scope =
    getQuery(event)['scope'] === 'available' ? 'available' : 'followed';
  return { repositories: await listRepositories(db, user.id, scope) };
});
