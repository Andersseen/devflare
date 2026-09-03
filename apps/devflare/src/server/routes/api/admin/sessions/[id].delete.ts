import { defineEventHandler, getRouterParam } from 'h3';
import { forward } from '../../../../lib/admin-proxy';

/** DELETE /api/admin/sessions/:id — revoke one session. */
export default defineEventHandler((event) => {
  const id = encodeURIComponent(getRouterParam(event, 'id') ?? '');
  return forward(event, `/admin/sessions/${id}`, { method: 'DELETE' });
});
