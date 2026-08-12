/**
 * The shape every /api/admin/* route shares: require a DevFlare session, then
 * forward to dev-auth as that person.
 *
 * DevFlare does not decide who is an administrator — dev-auth does, from its own
 * `ADMIN_EMAILS`. Keeping that judgement in one place means there is no second
 * list here to drift out of step with it. This layer only guarantees that the
 * request came from someone signed in, so the name it forwards is not invented.
 */

import { createError, type H3Event } from 'h3';
import { getAppSession, requireAuth } from './session';
import { callDevAuthAdmin, DevAuthAdminError } from './devauth-admin';

/**
 * Runs `call` as the signed-in user, translating the provider's errors into h3
 * errors so the browser sees the real status — 403 for "not an administrator"
 * rather than a 500 that hides it.
 */
export async function proxyAsAdmin<T>(
  event: H3Event,
  call: (actorEmail: string) => Promise<T>,
): Promise<T> {
  const user = requireAuth(await getAppSession(event));

  try {
    return await call(user.email);
  } catch (error) {
    if (error instanceof DevAuthAdminError) {
      throw createError({
        statusCode: error.status,
        statusMessage: error.message,
        data: { error: error.message },
      });
    }
    throw error;
  }
}

/** Convenience for the common case: one call, one path. */
export function forward<T>(
  event: H3Event,
  path: `/admin/${string}`,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  return proxyAsAdmin(event, (actorEmail) =>
    callDevAuthAdmin<T>(event, actorEmail, path, init),
  );
}
