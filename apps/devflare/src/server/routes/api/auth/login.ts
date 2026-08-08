import { defineEventHandler, getQuery, sendRedirect, setCookie } from 'h3';
import {
  authorizationUrl,
  codeChallenge,
  createCodeVerifier,
  createState,
  resolveOidcConfig,
  safeReturnTo,
} from '../../../lib/oidc';
import { isSecureRequest } from '../../../lib/session';

/**
 * GET /api/auth/login — starts the authorization code flow at dev-auth.
 *
 * The state and the PKCE verifier stay in a cookie on DevFlare's own domain: the
 * verifier proves at the token endpoint that the code came back to the browser
 * that requested it, and the state is compared on return so a code cannot be
 * injected from elsewhere.
 */
export const OAUTH_TRANSACTION_COOKIE = 'df_oauth_tx';

export default defineEventHandler(async (event) => {
  const config = resolveOidcConfig(event.context);
  const returnTo = safeReturnTo(getQuery(event)['returnTo']);

  const state = createState();
  const verifier = createCodeVerifier();
  const nonce = createState();

  setCookie(
    event,
    OAUTH_TRANSACTION_COOKIE,
    JSON.stringify({ state, verifier, returnTo }),
    {
      httpOnly: true,
      // The callback is a top-level navigation from the provider's origin, so
      // Strict would withhold this and every sign-in would fail state validation.
      sameSite: 'lax',
      secure: isSecureRequest(event),
      path: '/',
      maxAge: 60 * 10,
    },
  );

  return sendRedirect(
    event,
    authorizationUrl(config, {
      state,
      challenge: await codeChallenge(verifier),
      nonce,
    }),
  );
});
