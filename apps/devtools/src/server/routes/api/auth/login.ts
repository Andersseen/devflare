import { defineEventHandler, getQuery, sendRedirect, setCookie } from 'h3';
import { clientKey, enforceRateLimit } from '../../../lib/http';
import { getDevAuthClient } from '../../../lib/oidc';
import { isSecureRequest } from '../../../lib/session';

/**
 * GET /api/auth/login — starts the authorization code flow at DevAuth.
 *
 * @dev-auth/core generates state, nonce and the PKCE S256 verifier; they wait
 * in a short-lived HttpOnly cookie on DevTools' own origin until the callback.
 */
export const OAUTH_TRANSACTION_COOKIE = 'dt_oauth_tx';

export default defineEventHandler(async (event) => {
  await enforceRateLimit(event, 'AUTH_RATE_LIMITER', clientKey(event));

  const client = getDevAuthClient(event.context);
  const { url, transaction } = await client.createAuthorizationRequest({
    returnTo: getQuery(event)['returnTo'],
  });

  setCookie(event, OAUTH_TRANSACTION_COOKIE, JSON.stringify(transaction), {
    httpOnly: true,
    // The callback is a top-level navigation from DevAuth's origin; Strict
    // would withhold this and every sign-in would fail state validation.
    sameSite: 'lax',
    secure: isSecureRequest(event),
    path: '/api/auth',
    maxAge: 60 * 10,
  });

  return sendRedirect(event, url);
});
