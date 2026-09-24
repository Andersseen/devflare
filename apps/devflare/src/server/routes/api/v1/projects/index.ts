import {
  createError,
  defineEventHandler,
  readBody,
  setResponseStatus,
} from 'h3';
import { answer, callerOf } from '../../../../lib/project-http';
import {
  createProjectFor,
  listProjectsFor,
} from '../../../../lib/project-service';

/**
 * GET  /api/v1/projects — the caller's projects, each with `resources[]`.
 * POST /api/v1/projects — create one from `{ name, repoUrl? }`.
 *
 * Creating a project asks for nothing about infrastructure (spec 019);
 * resources are linked afterwards through ./[id]/resources.
 */
export default defineEventHandler(async (event) => {
  const caller = await callerOf(event);

  if (event.method === 'GET') {
    return answer(async () => ({ projects: await listProjectsFor(caller) }));
  }

  if (event.method === 'POST') {
    const body = await readBody(event);
    return answer(async () => {
      const project = await createProjectFor(caller, body);
      setResponseStatus(event, 201);
      return { project };
    });
  }

  throw createError({ statusCode: 405, statusMessage: 'Method Not Allowed' });
});
