import { defineEventHandler } from 'h3';
import { getLayout, saveLayout } from '../../../../lib/dashboard-store';
import {
  badInput,
  readLayoutBody,
  requireUserId,
} from '../../../../lib/dashboard-http';

/**
 * PUT /api/v1/dashboard — replaces the caller's layout. Presentation only: it
 * never reads or writes a project's Cloudflare resource links.
 */
export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event);
  const layout = await readLayoutBody(event);
  await badInput(() => saveLayout(userId, layout));
  return getLayout(userId);
});
