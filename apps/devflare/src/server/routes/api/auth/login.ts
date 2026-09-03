import { defineEventHandler, getQuery, sendRedirect, setCookie } from 'h3';
import { getDevAuthClient } from '../../../lib/oidc';
import { isSecureRequest } from '../../../lib/session';

/**
 * GET /api/auth/login — starts the authorization code flow at dev-auth.
 *
 * The state and the PKCE verifier stay in a cookie on DevFlare's own domain: the
 * verifier proves at the token endpoint that the code came back to the browser
 * that requested it, and the state is compared on return so a code cannot be
 * injected from elsewhere. @org/dev-auth-core generates and packages all of
 * this into `transaction`; this route only has to persist it.
 */
export const OAUTH_TRANSACTION_COOKIE = 'df_oauth_tx';

export default defineEventHandler(async (event) => {
  const client = getDevAuthClient(event.context);
  const { url, transaction } = await client.createAuthorizationRequest({
    returnTo: getQuery(event)['returnTo'],
  });

  setCookie(event, OAUTH_TRANSACTION_COOKIE, JSON.stringify(transaction), {
    httpOnly: true,
    // The callback is a top-level navigation from the provider's origin, so
    // Strict would withhold this and every sign-in would fail state validation.
    sameSite: 'lax',
    secure: isSecureRequest(event),
    path: '/',
    maxAge: 60 * 10,
  });

  return sendRedirect(event, url);
});
