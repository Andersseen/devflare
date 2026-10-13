import { defineEventHandler } from 'h3';
import { getLayout } from '../../../../lib/dashboard-store';
import { requireUserId } from '../../../../lib/dashboard-http';

/**
 * GET /api/v1/dashboard — the caller's visual layout (groups, order, hidden).
 * An untouched account gets an empty layout and `customized: false`; the
 * client then shows every card in its default order.
 */
export default defineEventHandler(async (event) => {
  return getLayout(await requireUserId(event));
});
