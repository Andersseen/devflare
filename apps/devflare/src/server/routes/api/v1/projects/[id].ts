import { createError, defineEventHandler, readBody } from 'h3';
import { answer, callerOf, routeParam } from '../../../../lib/project-http';
import {
  deleteProjectFor,
  getProjectFor,
  updateProjectFor,
} from '../../../../lib/project-service';

/**
 * GET    /api/v1/projects/:id — one project with its resources.
 * PATCH  /api/v1/projects/:id — edit `name` and/or `repoUrl`.
 * DELETE /api/v1/projects/:id — remove it, its links and its deploy log.
 *
 * PATCH used to set the single `cfType`/`cfName` link (spec 005). Links are a
 * collection now, with their own routes under ./[id]/resources.
 */
export default defineEventHandler(async (event) => {
  const caller = await callerOf(event);
  const id = routeParam(event, 'id');

  if (event.method === 'GET') {
    return answer(async () => ({ project: await getProjectFor(caller, id) }));
  }

  if (event.method === 'PATCH') {
    const body = await readBody(event);
    return answer(async () => ({
      project: await updateProjectFor(caller, id, body),
    }));
  }

  if (event.method === 'DELETE') {
    return answer(async () => {
      await deleteProjectFor(caller, id);
      return { success: true };
    });
  }

  throw createError({ statusCode: 405, statusMessage: 'Method Not Allowed' });
});
