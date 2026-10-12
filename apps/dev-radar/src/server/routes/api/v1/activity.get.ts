import { defineEventHandler } from 'h3';
import { db } from '../../../db';
import { requireAllowedUser } from '../../../lib/http';
import { listActivity } from '../../../lib/store/queries';

/** GET /api/v1/activity — normalized events, newest first (bounded history). */
export default defineEventHandler(async (event) => {
  await requireAllowedUser(event);
  return { events: await listActivity(db, 100) };
});
