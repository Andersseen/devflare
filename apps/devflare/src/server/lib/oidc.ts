import {
  createDevAuthClient,
  safeReturnTo,
  type DevAuthClientConfig,
} from '@dev-auth/core';

/**
 * DevFlare as an OAuth 2.1 / OIDC *client* of dev-auth, wired through
 * @dev-auth/core.
 *
 * dev-auth is the identity provider and owns credentials, GitHub linking and its
 * own session. DevFlare only ever sees the result of an authorization code flow,
 * which is what lets the same provider serve applications on unrelated domains —
 * nothing here depends on sharing a cookie with dev-auth.
 *
 * DevFlare is registered there as a confidential client, so the code exchange is
 * authenticated with both PKCE and a client secret. Everything protocol-shaped
 * (PKCE, state/nonce, discovery, the code exchange, userinfo, normalized errors)
 * lives in @dev-auth/core; this file only resolves *this app's* config from
 * its environment, which is Cloudflare-specific and has no business in a
 * portable SDK.
 */

export type OidcConfig = DevAuthClientConfig;

/**
 * Where configuration comes from. Deliberately not `H3Event`: nothing in this
 * module imports h3, which keeps it plain protocol code — and lets it be tested
 * without the framework. Routes pass `event.context`.
 */
export interface RequestContext {
  cloudflare?: { env?: Record<string, string | undefined> };
}

/**
 * On Cloudflare, `vars` arrive as a per-request binding rather than as
 * `process.env`; the unenv `process` shim is an implementation detail not worth
 * betting the auth path on. Read the binding first, keep `process.env` for
 * non-Cloudflare runtimes (vitest, plain node).
 */
function env(context: RequestContext, key: string): string | undefined {
  return context.cloudflare?.env?.[key] ?? process.env[key];
}

export function resolveOidcConfig(context: RequestContext): OidcConfig {
  const issuer = env(context, 'DEV_AUTH_URL') ?? 'http://localhost:8787';

  return {
    // A trailing slash here would double every endpoint path, and the provider
    // matches the redirect URI exactly.
    issuer: issuer.replace(/\/$/, ''),
    clientId: env(context, 'DEV_AUTH_CLIENT_ID') ?? 'devflare-dev',
    clientSecret: env(context, 'DEV_AUTH_CLIENT_SECRET'),
    redirectUri:
      env(context, 'DEV_AUTH_REDIRECT_URI') ??
      'http://localhost:4200/api/auth/callback',
  };
}

/** One @dev-auth/core client, configured for this app's environment. */
export function getDevAuthClient(context: RequestContext) {
  return createDevAuthClient(resolveOidcConfig(context));
}

export { safeReturnTo };
