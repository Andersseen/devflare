import { defineEventHandler, readBody } from 'h3';
import { forward } from '../../../../lib/admin-proxy';

/**
 * PATCH /api/admin/settings/github — client id, secret, on/off.
 * The secret is write-only: dev-auth stores it sealed and never returns it.
 */
export default defineEventHandler(async (event) =>
  forward(event, '/admin/settings/github', {
    method: 'PATCH',
    body: await readBody(event),
  }),
);
