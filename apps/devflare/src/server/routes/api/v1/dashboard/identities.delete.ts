import { defineEventHandler } from 'h3';
import { resetIdentityOverrides } from '../../../../lib/dashboard-store';
import { requireUserId } from '../../../../lib/dashboard-http';

/** DELETE /api/v1/dashboard/identities — back to the built-in defaults. */
export default defineEventHandler(async (event) => {
  await resetIdentityOverrides(await requireUserId(event));
  return { identities: [] };
});
