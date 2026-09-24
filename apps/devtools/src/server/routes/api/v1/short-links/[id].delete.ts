import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3';
import { db } from '../../../../db';
import {
  assertSameOriginJson,
  enforceRateLimit,
  requireAllowedUser,
} from '../../../../lib/http';
import { withShortLinkErrors } from '../../../../lib/short-links/http';
import { deleteLink } from '../../../../lib/short-links/store';

/** DELETE /api/v1/short-links/:id */
export default defineEventHandler(async (event) => {
  assertSameOriginJson(event, false);
  const user = await requireAllowedUser(event);
  await enforceRateLimit(event, 'MUTATION_RATE_LIMITER', user.id);

  const id = getRouterParam(event, 'id') ?? '';
  await withShortLinkErrors(() => deleteLink(db, user.id, id));
  setResponseStatus(event, 204);
  return null;
});
