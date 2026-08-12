import { defineEventHandler, readBody } from 'h3';
import { forward } from '../../../../lib/admin-proxy';

/** PUT /api/admin/settings/allowlist — replace who may sign up. */
export default defineEventHandler(async (event) =>
  forward(event, '/admin/settings/allowlist', {
    method: 'PUT',
    body: await readBody(event),
  }),
);
