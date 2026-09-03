import { defineEventHandler, getRouterParam } from 'h3';
import { forward } from '../../../../../lib/admin-proxy';

/** POST /api/admin/users/:id/unban — allow this identity to sign in again. */
export default defineEventHandler((event) => {
  const id = encodeURIComponent(getRouterParam(event, 'id') ?? '');
  return forward(event, `/admin/users/${id}/unban`, { method: 'POST' });
});
