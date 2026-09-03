import { defineEventHandler, getRouterParam } from 'h3';
import { forward } from '../../../../lib/admin-proxy';

/** GET /api/admin/users/:id — one identity, its providers and session count. */
export default defineEventHandler((event) => {
  const id = encodeURIComponent(getRouterParam(event, 'id') ?? '');
  return forward(event, `/admin/users/${id}`);
});
