import { defineEventHandler } from 'h3';
import { getIdentityOverrides } from '../../../../lib/dashboard-store';
import { requireUserId } from '../../../../lib/dashboard-http';

/** GET /api/v1/dashboard/identities — the caller's edits to the built-in discovery groups. */
export default defineEventHandler(async (event) => {
  return { identities: await getIdentityOverrides(await requireUserId(event)) };
});
