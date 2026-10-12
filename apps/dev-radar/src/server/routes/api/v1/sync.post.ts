import { createError, defineEventHandler } from 'h3';
import {
  assertSameOriginJson,
  enforceRateLimit,
  requireAllowedUser,
} from '../../../lib/http';
import { runSync } from '../../../lib/sync/run';

/**
 * POST /api/v1/sync — manual refresh. Authorized users only, same-origin,
 * rate limited. Runs one budgeted sync pass and reports what it did; call it
 * again to continue when `repositoriesRemaining` is above zero.
 */
export default defineEventHandler(async (event) => {
  const user = await requireAllowedUser(event);
  assertSameOriginJson(event, false);
  await enforceRateLimit(event, 'MUTATION_RATE_LIMITER', user.id);

  const result = await runSync(event.context);
  if (!result) {
    throw createError({
      statusCode: 409,
      statusMessage: 'The GitHub App is not configured',
      data: { code: 'not_configured' },
    });
  }
  return result;
});
