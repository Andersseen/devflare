import { createError, defineEventHandler, readBody } from 'h3';
import { db } from '../../../db';
import { getAppSession, requireAuth } from '../../../lib/session';

/**
 * PATCH /api/auth/user — updates the display name DevFlare shows.
 *
 * Local to DevFlare. Under the OAuth model the provider owns credentials and
 * identity, and a consumer holding an access token has no business rewriting the
 * account there — so the name a user edits in DevFlare's settings is DevFlare's
 * own copy. Email and avatar keep coming from the provider on each sign-in.
 */
export default defineEventHandler(async (event) => {
  if (event.method !== 'PATCH') {
    throw createError({ statusCode: 405, statusMessage: 'Method Not Allowed' });
  }

  const user = requireAuth(await getAppSession(event));
  const body = await readBody(event);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';

  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'Name is required' });
  }

  await db.sql`UPDATE app_user SET name = ${name}, updatedAt = ${new Date().toISOString()} WHERE id = ${user.id}`;

  return { user: { ...user, name } };
});
