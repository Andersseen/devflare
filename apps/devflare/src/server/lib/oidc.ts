/**
 * DevFlare as an OAuth 2.1 / OIDC *client* of dev-auth.
 *
 * dev-auth is the identity provider and owns credentials, GitHub linking and its
 * own session. DevFlare only ever sees the result of an authorization code flow,
 * which is what lets the same provider serve applications on unrelated domains —
 * nothing here depends on sharing a cookie with dev-auth.
 *
 * DevFlare is registered there as a confidential client, so the code exchange is
 * authenticated with both PKCE and a client secret.
 */

/**
 * Raised when the provider refuses or cannot answer. The callback route turns it
 * into a redirect back to the login page — h3 is deliberately not imported here,
 * so these helpers stay pure protocol code with no framework or runtime
 * dependency (which is also what makes them unit-testable).
 */
export class OidcError extends Error {}

export interface OidcConfig {
  /** Base URL of the provider, e.g. https://auth-devflare.andersseen.dev */
  issuer: string;
  clientId: string;
  clientSecret?: string;
  /**
   * Must match one of the redirect URIs registered for this client id, byte for
   * byte — the provider compares them with string equality.
   */
  redirectUri: string;
}

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

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function randomToken(byteLength = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

/** Opaque value tying the callback to the request that started it (CSRF). */
export const createState = randomToken;

/** PKCE verifier — kept in a cookie on this app's own domain, never sent out. */
export const createCodeVerifier = randomToken;

/** S256 challenge. The provider rejects `plain`. */
export async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  );
  return base64Url(new Uint8Array(digest));
}

export function authorizationUrl(
  config: OidcConfig,
  params: { state: string; challenge: string; nonce: string },
): string {
  const url = new URL(`${config.issuer}/api/auth/oauth2/authorize`);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: 'openid profile email',
    state: params.state,
    nonce: params.nonce,
    code_challenge: params.challenge,
    code_challenge_method: 'S256',
  }).toString();
  return url.toString();
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  id_token?: string;
  refresh_token?: string;
  scope?: string;
}

/**
 * Back-channel code exchange: server to server, so the tokens never touch the
 * browser.
 */
export async function exchangeCode(
  config: OidcConfig,
  code: string,
  codeVerifier: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    code_verifier: codeVerifier,
  });
  // Omitted for public clients, which are authenticated by PKCE alone.
  if (config.clientSecret) body.set('client_secret', config.clientSecret);

  const response = await fetch(`${config.issuer}/api/auth/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    // The provider's error body names the client or the secret; log it for the
    // operator but never forward it to the browser.
    console.error(
      `[oidc] token exchange failed (${response.status}): ${await response.text()}`,
    );
    throw new OidcError(`token exchange failed with ${response.status}`);
  }

  return (await response.json()) as TokenResponse;
}

export interface UserInfo {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
  image?: string;
}

/**
 * Identity is read from the userinfo endpoint rather than decoded from the ID
 * token: it is one authenticated call against the issuer, so there is no
 * signature to verify and no key to keep in sync.
 */
export async function fetchUserInfo(
  config: OidcConfig,
  accessToken: string,
): Promise<UserInfo> {
  const response = await fetch(`${config.issuer}/api/auth/oauth2/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    console.error(
      `[oidc] userinfo failed (${response.status}): ${await response.text()}`,
    );
    throw new OidcError(`userinfo failed with ${response.status}`);
  }

  const info = (await response.json()) as UserInfo;
  if (!info?.sub) {
    throw new OidcError('provider returned no subject');
  }
  return info;
}

/**
 * Where to land after sign-in. Only same-site paths are accepted: a `returnTo`
 * arrives from the browser, and echoing an absolute URL back into a redirect is
 * an open redirect. `//host` is rejected too — browsers read it as protocol
 * relative and leave the site.
 */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/')) return '/';
  if (value.startsWith('//')) return '/';
  return value;
}
