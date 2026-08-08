import { createError, defineEventHandler } from 'h3';
import { endSession } from '../../../lib/session';

/**
 * POST /api/auth/logout — ends DevFlare's session.
 *
 * Deliberately local only: the provider's session stays alive, so signing out of
 * DevFlare does not sign the user out of the other applications that share it.
 * Ending the provider session too is what its /api/auth/sign-out is for.
 */
export default defineEventHandler(async (event) => {
  if (event.method !== 'POST') {
    throw createError({ statusCode: 405, statusMessage: 'Method Not Allowed' });
  }

  await endSession(event);
  return { success: true };
});
