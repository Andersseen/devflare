import { defineEventHandler, getQuery } from 'h3';
import { forward } from '../../../../lib/admin-proxy';

/** GET /api/admin/sessions — live DevAuth sessions. `?userId=` filters. */
export default defineEventHandler((event) => {
  const { userId } = getQuery(event);
  const suffix =
    typeof userId === 'string' && userId
      ? `?userId=${encodeURIComponent(userId)}`
      : '';
  return forward(event, `/admin/sessions${suffix}`);
});
