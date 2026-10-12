import { defineEventHandler } from 'h3';
import { db } from '../../../../db';
import { requireAllowedUser } from '../../../../lib/http';
import { listRepositories } from '../../../../lib/store/queries';

/** GET /api/v1/repositories — every monitored repository. */
export default defineEventHandler(async (event) => {
  await requireAllowedUser(event);
  return { repositories: await listRepositories(db) };
});
