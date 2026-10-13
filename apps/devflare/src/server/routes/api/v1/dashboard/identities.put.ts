import { defineEventHandler, readBody } from 'h3';
import {
  getIdentityOverrides,
  parseIdentityOverrides,
  saveIdentityOverrides,
} from '../../../../lib/dashboard-store';
import { badInput, requireUserId } from '../../../../lib/dashboard-http';

/**
 * PUT /api/v1/dashboard/identities — replaces the caller's overrides: edited
 * or user-defined discovery groups and tombstones for built-in ones. Verified
 * domains are not accepted here; only the built-in defaults carry them.
 */
export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event);
  const body = await readBody(event);
  await badInput(async () => {
    await saveIdentityOverrides(userId, parseIdentityOverrides(body));
  });
  return { identities: await getIdentityOverrides(userId) };
});
