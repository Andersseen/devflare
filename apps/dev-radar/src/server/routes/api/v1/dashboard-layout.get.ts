import { defineEventHandler } from 'h3';
import { db } from '../../../db';
import { requireAllowedUser } from '../../../lib/http';
import { getDashboardLayout } from '../../../lib/store/dashboard';

/** GET /api/v1/dashboard-layout — the signed-in user's groups, order, pins. */
export default defineEventHandler(async (event) => {
  const user = await requireAllowedUser(event);
  return { layout: await getDashboardLayout(db, user.id) };
});
