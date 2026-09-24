import {
  createError,
  defineEventHandler,
  readBody,
  setResponseStatus,
} from 'h3';
import {
  answer,
  callerOf,
  routeParam,
  verificationAccess,
} from '../../../../../../lib/project-http';
import {
  linkResourceFor,
  listResourcesFor,
} from '../../../../../../lib/project-service';

/**
 * GET  /api/v1/projects/:id/resources — the resources this project owns.
 * POST /api/v1/projects/:id/resources — link one: `{ type, resourceId }`
 *      (`provider` optional; only `cloudflare`).
 *
 * A link is written only after Cloudflare confirms the resource exists; each
 * refusal carries `data.reason` (`invalid`, `conflict`, `not-found`,
 * `unverifiable`). See linkResourceFor in lib/project-service.ts.
 */
export default defineEventHandler(async (event) => {
  const caller = await callerOf(event);
  const id = routeParam(event, 'id');

  if (event.method === 'GET') {
    return answer(async () => ({
      resources: await listResourcesFor(caller, id),
    }));
  }

  if (event.method === 'POST') {
    const body = await readBody(event);
    return answer(async () => {
      const resource = await linkResourceFor(
        caller,
        id,
        body,
        verificationAccess(event),
      );
      setResponseStatus(event, 201);
      return { resource };
    });
  }

  throw createError({ statusCode: 405, statusMessage: 'Method Not Allowed' });
});
