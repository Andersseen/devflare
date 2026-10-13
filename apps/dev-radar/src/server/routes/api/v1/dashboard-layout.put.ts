import { createError, defineEventHandler, readBody } from 'h3';
import { parseLayout } from '@org/dashboard-layout/logic';
import { db } from '../../../db';
import {
  assertSameOriginJson,
  enforceRateLimit,
  requireAllowedUser,
} from '../../../lib/http';
import {
  LayoutInputError,
  getDashboardLayout,
  saveDashboardLayout,
} from '../../../lib/store/dashboard';

/** A GitHub repository id as the layout carries it: digits, no leading zero. */
const REPOSITORY_ID = /^[1-9]\d{0,14}$/;
const MAX_FOLLOWED = 2000;

/**
 * PUT /api/v1/dashboard-layout — replaces the caller's layout. The followed
 * set is exactly the repositories placed in it (unfollowing = leaving one out),
 * so `hiddenIds` must be empty. Scoped to the signed-in user in every query.
 */
export default defineEventHandler(async (event) => {
  const user = await requireAllowedUser(event);
  assertSameOriginJson(event);
  await enforceRateLimit(event, 'MUTATION_RATE_LIMITER', user.id);

  const parsed = parseLayout(await readBody(event), {
    maxItems: MAX_FOLLOWED,
    isItemId: (value) => REPOSITORY_ID.test(value),
  });
  if (!parsed.ok || parsed.layout.hiddenIds.length > 0) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.ok ? 'hiddenIds must be empty' : parsed.error,
      data: { code: 'invalid_layout' },
    });
  }

  try {
    await saveDashboardLayout(db, user.id, parsed.layout);
  } catch (error) {
    if (error instanceof LayoutInputError) {
      throw createError({
        statusCode: 400,
        statusMessage: error.message,
        data: { code: 'invalid_layout' },
      });
    }
    throw error;
  }
  return { layout: await getDashboardLayout(db, user.id) };
});
