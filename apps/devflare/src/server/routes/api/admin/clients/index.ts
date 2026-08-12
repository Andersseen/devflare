import { defineEventHandler, readBody } from 'h3';
import { forward } from '../../../../lib/admin-proxy';

/**
 * GET  /api/admin/clients — the apps registered with dev-auth.
 * POST /api/admin/clients — register one. The response carries the generated
 * client secret, which is the only time it exists outside a hash.
 */
export default defineEventHandler(async (event) => {
  if (event.method === 'POST') {
    return forward(event, '/admin/clients', {
      method: 'POST',
      body: await readBody(event),
    });
  }

  return forward(event, '/admin/clients');
});
