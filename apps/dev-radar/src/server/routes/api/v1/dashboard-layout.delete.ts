import { defineEventHandler } from 'h3';
import { db } from '../../../db';
import {
  assertSameOriginJson,
  enforceRateLimit,
  requireAllowedUser,
} from '../../../lib/http';
import {
  getDashboardLayout,
  resetDashboardLayout,
} from '../../../lib/store/dashboard';

/**
 * DELETE /api/v1/dashboard-layout — restores the default arrangement: groups
 * and pins are dropped, followed repositories stay (ordered by name).
 */
export default defineEventHandler(async (event) => {
  const user = await requireAllowedUser(event);
  assertSameOriginJson(event, false);
  await enforceRateLimit(event, 'MUTATION_RATE_LIMITER', user.id);
  await resetDashboardLayout(db, user.id);
  return { layout: await getDashboardLayout(db, user.id) };
});
