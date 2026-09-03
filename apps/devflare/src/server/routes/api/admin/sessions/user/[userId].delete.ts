import { defineEventHandler, getRouterParam } from 'h3';
import { forward } from '../../../../../lib/admin-proxy';

/** DELETE /api/admin/sessions/user/:userId — revoke every session for a user. */
export default defineEventHandler((event) => {
  const userId = encodeURIComponent(getRouterParam(event, 'userId') ?? '');
  return forward(event, `/admin/sessions/user/${userId}`, {
    method: 'DELETE',
  });
});
