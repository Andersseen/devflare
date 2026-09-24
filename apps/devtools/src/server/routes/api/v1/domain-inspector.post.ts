import { createError, defineEventHandler, readBody } from 'h3';
import {
  assertSameOriginJson,
  enforceRateLimit,
  requireAllowedUser,
} from '../../../lib/http';
import { inspectDomain } from '../../../lib/domain-inspector/inspect';
import { TargetError } from '../../../lib/domain-inspector/target';

/**
 * POST /api/v1/domain-inspector — `{ target }`.
 *
 * Signed in + allowed + rate limited: a server that fetches user-supplied
 * hosts must not be an open scanner. The response carries status and headers
 * only, never a body. Nothing is stored or logged about the target.
 */
export default defineEventHandler(async (event) => {
  assertSameOriginJson(event);
  const user = await requireAllowedUser(event);
  await enforceRateLimit(event, 'INSPECT_RATE_LIMITER', user.id);

  const body = await readBody<{ target?: unknown }>(event);
  try {
    return await inspectDomain(body?.target, {
      fetch: (input, init) => fetch(input, init),
    });
  } catch (error) {
    if (error instanceof TargetError) {
      throw createError({
        statusCode: 422,
        statusMessage: error.message,
        data: { code: `target_${error.problem}` },
      });
    }
    throw error;
  }
});
