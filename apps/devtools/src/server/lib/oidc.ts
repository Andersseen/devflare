import {
  createDevAuthClient,
  safeReturnTo,
  type DevAuthClientConfig,
} from '@dev-auth/core';
import { envVar, type RequestContext } from './env';

/**
 * DevTools as an OAuth 2.1 / OIDC client of DevAuth, through @dev-auth/core.
 *
 * A separate registered client from DevFlare (`devtools-dev` locally,
 * `devtools` in production): its own client id, its own exact redirect URI,
 * its own secret. Everything protocol-shaped — PKCE S256, state, nonce,
 * discovery, the code exchange, userinfo — is the SDK's job; this file only
 * resolves DevTools' configuration.
 */
export function resolveOidcConfig(
  context: RequestContext,
): DevAuthClientConfig {
  const issuer = envVar(context, 'DEV_AUTH_URL') ?? 'http://localhost:8787';

  return {
    issuer: issuer.replace(/\/$/, ''),
    clientId: envVar(context, 'DEV_AUTH_CLIENT_ID') ?? 'devtools-dev',
    clientSecret: envVar(context, 'DEV_AUTH_CLIENT_SECRET'),
    redirectUri:
      envVar(context, 'DEV_AUTH_REDIRECT_URI') ??
      'http://localhost:4300/api/auth/callback',
  };
}

export function getDevAuthClient(context: RequestContext) {
  return createDevAuthClient(resolveOidcConfig(context));
}

export { safeReturnTo };
