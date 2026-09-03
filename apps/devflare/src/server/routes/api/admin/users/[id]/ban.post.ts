import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { forward } from '../../../../../lib/admin-proxy';

/** POST /api/admin/users/:id/ban — block new sign-ins for this identity. */
export default defineEventHandler(async (event) => {
  const id = encodeURIComponent(getRouterParam(event, 'id') ?? '');
  return forward(event, `/admin/users/${id}/ban`, {
    method: 'POST',
    body: await readBody(event),
  });
});
