import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { forward } from '../../../../lib/admin-proxy';

/**
 * PATCH  /api/admin/clients/:clientId — edit redirect URIs, name, flags.
 * DELETE /api/admin/clients/:clientId — remove it and revoke its tokens.
 *
 * Configured clients are refused by dev-auth with a 409 and an explanation,
 * which this forwards unchanged.
 */
export default defineEventHandler(async (event) => {
  const clientId = encodeURIComponent(getRouterParam(event, 'clientId') ?? '');

  if (event.method === 'DELETE') {
    return forward(event, `/admin/clients/${clientId}`, { method: 'DELETE' });
  }

  return forward(event, `/admin/clients/${clientId}`, {
    method: 'PATCH',
    body: await readBody(event),
  });
});
