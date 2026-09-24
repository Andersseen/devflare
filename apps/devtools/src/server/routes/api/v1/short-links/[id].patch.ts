import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { db } from '../../../../db';
import {
  assertSameOriginJson,
  enforceRateLimit,
  requireAllowedUser,
} from '../../../../lib/http';
import {
  shortLinkBase,
  withShortLinkErrors,
} from '../../../../lib/short-links/http';
import { updateLink } from '../../../../lib/short-links/store';

/** PATCH /api/v1/short-links/:id — any of `{ slug, destination, active }`. */
export default defineEventHandler(async (event) => {
  assertSameOriginJson(event);
  const user = await requireAllowedUser(event);
  await enforceRateLimit(event, 'MUTATION_RATE_LIMITER', user.id);

  const id = getRouterParam(event, 'id') ?? '';
  const body = await readBody(event);
  const link = await withShortLinkErrors(() =>
    updateLink(db, user.id, id, body, shortLinkBase(event)),
  );
  return { link };
});
