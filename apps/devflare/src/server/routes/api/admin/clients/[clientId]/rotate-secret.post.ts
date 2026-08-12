import { defineEventHandler, getRouterParam } from 'h3';
import { forward } from '../../../../../lib/admin-proxy';

/**
 * POST /api/admin/clients/:clientId/rotate-secret — issue a new client secret.
 * The plaintext comes back once and is never retrievable afterwards.
 */
export default defineEventHandler((event) => {
  const clientId = encodeURIComponent(getRouterParam(event, 'clientId') ?? '');
  return forward(event, `/admin/clients/${clientId}/rotate-secret`, {
    method: 'POST',
  });
});
