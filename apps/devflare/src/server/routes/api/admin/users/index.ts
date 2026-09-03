import { defineEventHandler, getQuery } from 'h3';
import { forward } from '../../../../lib/admin-proxy';

/** GET /api/admin/users — identities known to dev-auth. `?q=` filters. */
export default defineEventHandler((event) => {
  const { q } = getQuery(event);
  const suffix =
    typeof q === 'string' && q ? `?q=${encodeURIComponent(q)}` : '';
  return forward(event, `/admin/users${suffix}`);
});
