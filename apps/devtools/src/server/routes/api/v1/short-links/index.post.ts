import { defineEventHandler, readBody, setResponseStatus } from 'h3';
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
import { createLink } from '../../../../lib/short-links/store';

/** POST /api/v1/short-links — `{ slug, destination }`. */
export default defineEventHandler(async (event) => {
  assertSameOriginJson(event);
  const user = await requireAllowedUser(event);
  await enforceRateLimit(event, 'MUTATION_RATE_LIMITER', user.id);

  const body = await readBody(event);
  const link = await withShortLinkErrors(() =>
    createLink(db, user.id, body, shortLinkBase(event)),
  );
  setResponseStatus(event, 201);
  return { link };
});
