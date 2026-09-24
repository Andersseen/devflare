import { defineEventHandler } from 'h3';
import { assertSameOriginJson } from '../../../lib/http';
import { endSession } from '../../../lib/session';

/**
 * POST /api/auth/logout — ends DevTools' session only. DevAuth's own session
 * and every other application signed in through it are left alone.
 */
export default defineEventHandler(async (event) => {
  assertSameOriginJson(event, false);
  await endSession(event);
  return { success: true };
});
