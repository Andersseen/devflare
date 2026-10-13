import { createError, defineEventHandler, getRouterParam } from 'h3';
import { db } from '../../../../db';
import { requireAllowedUser } from '../../../../lib/http';
import { getRepositoryDetail } from '../../../../lib/store/queries';

/**
 * GET /api/v1/repositories/:id — `:id` is GitHub's numeric repository id.
 * Works for any synchronized repository, followed or not.
 */
export default defineEventHandler(async (event) => {
  const user = await requireAllowedUser(event);

  const raw = getRouterParam(event, 'id') ?? '';
  const id = /^\d{1,15}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(id)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid repository id',
    });
  }

  const detail = await getRepositoryDetail(db, user.id, id);
  if (!detail) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Repository not found',
    });
  }
  return detail;
});
