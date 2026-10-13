import { defineEventHandler } from 'h3';
import { getLayout, resetLayout } from '../../../../lib/dashboard-store';
import { requireUserId } from '../../../../lib/dashboard-http';

/** DELETE /api/v1/dashboard — restore the default layout. */
export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event);
  await resetLayout(userId);
  return getLayout(userId);
});
