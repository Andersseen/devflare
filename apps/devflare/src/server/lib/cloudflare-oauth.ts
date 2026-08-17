/**
 * DevFlare as an OAuth client of Cloudflare's *own* authorization server.
 *
 * Cloudflare shipped self-managed OAuth clients on 2026-06-03, which is what
 * makes this possible: an app can now ask an account owner for scoped access
 * from a consent screen instead of asking a human to mint an API token by hand
 * and paste it into a secret store. The credential that comes back lives 900
 * seconds and is renewed here; the owner can revoke it from the dashboard.
 *
 * This is authorization, not identity — Cloudflare's discovery document
 * advertises `claims_supported: ["sub"]` and no email, so nothing here has any
 * business touching sign-in. DevFlare's users still come from dev-auth (see
 * ./oidc.ts).
 *
 * Like ./oidc.ts and ./cloudflare.ts this imports no h3: it is plain protocol
 * code that routes call with `event.context`, which is also what makes it
 * testable without the framework.
 */

import { API_BASE, CloudflareApiError, cfRequest } from './cloudflare';
import type { RequestContext } from './cloudflare';
import {
  codeChallenge,
  createCodeVerifier,
  createState,
  type TokenResponse,
} from './oidc';

// Generic RFC 6749/7636 primitives that happen to already live next door.
// Re-exported rather than copied so there is one implementation of the PKCE
// challenge in this server, not one per authorization server it talks to.
export { codeChallenge, createCodeVerifier, createState };

/** All four endpoints come from https://dash.cloudflare.com/.well-known/openid-configuration. */
export const CF_OAUTH_ISSUER = 'https://dash.cloudflare.com';
export const CF_AUTHORIZE_URL = `${CF_OAUTH_ISSUER}/oauth2/auth`;
export const CF_TOKEN_URL = `${CF_OAUTH_ISSUER}/oauth2/token`;
export const CF_REVOKE_URL = `${CF_OAUTH_ISSUER}/oauth2/revoke`;

/**
 * Exactly the permissions the Cloud section used to ask for by hand, plus
 * `memberships.read`, which is only used to put a name to the account id. Every
 * id was checked against `GET /client/v4/oauth/scopes` — one unknown scope
 * fails the whole authorization with `invalid_scope`, before the owner sees a
 * consent screen at all.
 *
 * `offline_access` is deliberately **not** here, though the standard says it is
 * what asks for a refresh token, and Cloudflare's discovery document lists it
 * under `scopes_supported`. Requesting it against a real self-managed client
 * (2026-08-17) is refused outright:
 *
 *   error=invalid_scope — The OAuth 2.0 Client is not allowed to request scope
 *   'offline_access'
 *
 * and the 383-entry scope catalog a client is registered from contains no
 * `offline_access`, `offline` or `openid`, so no client can be given it. Whether
 * a refresh token comes back anyway — from the client's `refresh_token` grant
 * type rather than from a scope — is not documented either way; ./cloudflare-connection.ts
 * therefore treats one as optional and degrades to a reconnect prompt without it.
 */
export const CF_OAUTH_SCOPES = [
  'memberships.read',
  'page.read',
  'page.write',
  'workers-scripts.read',
  'd1.read',
  'workers-kv-storage.read',
  'workers-r2.read',
] as const;

export class CloudflareOAuthError extends Error {
  constructor(
    message: string,
    /** `invalid_grant` means the grant is gone for good — do not retry it. */
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = 'CloudflareOAuthError';
  }
}

export interface CloudflareOAuthConfig {
  clientId: string;
  clientSecret: string;
  /**
   * Compared byte for byte by the authorization server against the list
   * registered for this client, so it is configured rather than derived from
   * the request host.
   */
  redirectUri: string;
}

function env(context: RequestContext, key: string): string | undefined {
  return context.cloudflare?.env?.[key] ?? process.env[key];
}

/**
 * Null when this deployment has no OAuth client — an ordinary state, not a
 * failure: the Cloud section then falls back to `CLOUDFLARE_API_TOKEN` and the
 * UI offers the manual instructions instead of a connect button.
 */
export function resolveCloudflareOAuthConfig(
  context: RequestContext,
): CloudflareOAuthConfig | null {
  const clientId = env(context, 'CLOUDFLARE_OAUTH_CLIENT_ID');
  const clientSecret = env(context, 'CLOUDFLARE_OAUTH_CLIENT_SECRET');
  const redirectUri = env(context, 'CLOUDFLARE_OAUTH_REDIRECT_URI');

  if (!clientId || !clientSecret || !redirectUri) return null;

  return { clientId, clientSecret, redirectUri };
}

/**
 * The account this install has always pointed at. Not a credential — it appears
 * in every API URL — and configured for every environment already, which is
 * what lets a fresh grant resolve to the same account without asking.
 */
export function preferredAccountId(
  context: RequestContext,
): string | undefined {
  return env(context, 'CLOUDFLARE_ACCOUNT_ID');
}

export function authorizationUrl(
  config: CloudflareOAuthConfig,
  params: { state: string; challenge: string },
): string {
  const url = new URL(CF_AUTHORIZE_URL);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: CF_OAUTH_SCOPES.join(' '),
    state: params.state,
    code_challenge: params.challenge,
    // The server also advertises `plain`. It is never used: a challenge equal
    // to its verifier proves nothing about who is redeeming the code.
    code_challenge_method: 'S256',
  }).toString();
  return url.toString();
}

/**
 * What Cloudflare adds to a standard token response. `resource` is documented
 * as present but not as a shape, so it is read as a hint and nothing depends on
 * it (see `accountHints`).
 */
export interface CloudflareTokenResponse extends TokenResponse {
  resource?: string | string[];
}

interface OAuthErrorBody {
  error?: string;
  error_description?: string;
}

/**
 * One call to the token endpoint. `client_secret_post` because that is what the
 * discovery document advertises and what ./oidc.ts already does with dev-auth —
 * one spelling of client authentication in this server rather than two.
 */
async function postToken(
  config: CloudflareOAuthConfig,
  body: URLSearchParams,
): Promise<CloudflareTokenResponse> {
  body.set('client_id', config.clientId);
  body.set('client_secret', config.clientSecret);

  let response: Response;
  try {
    response = await fetch(CF_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new CloudflareOAuthError(
      'could not reach the Cloudflare token endpoint',
    );
  }

  const text = await response.text();

  if (!response.ok) {
    let parsed: OAuthErrorBody = {};
    try {
      parsed = JSON.parse(text) as OAuthErrorBody;
    } catch {
      // A gateway error page rather than an OAuth error. Nothing to read out.
    }
    // Logged for the operator, never returned to the browser: the body names
    // the client and, on a misconfiguration, quotes what was sent.
    console.error(
      `[cf-oauth] token endpoint failed (${response.status}): ${parsed.error ?? text.slice(0, 200)}`,
    );
    throw new CloudflareOAuthError(
      `token request failed with ${response.status}`,
      parsed.error ?? null,
    );
  }

  const tokens = JSON.parse(text) as CloudflareTokenResponse;
  if (!tokens?.access_token) {
    throw new CloudflareOAuthError('token response carried no access token');
  }
  return tokens;
}

export function exchangeCode(
  config: CloudflareOAuthConfig,
  code: string,
  codeVerifier: string,
): Promise<CloudflareTokenResponse> {
  return postToken(
    config,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
      code_verifier: codeVerifier,
    }),
  );
}

export function refreshTokens(
  config: CloudflareOAuthConfig,
  refreshToken: string,
): Promise<CloudflareTokenResponse> {
  return postToken(
    config,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  );
}

/**
 * Best-effort: disconnecting locally must succeed even if the revocation does
 * not, or a connection whose upstream is already gone could never be cleared.
 */
export async function revokeToken(
  config: CloudflareOAuthConfig,
  token: string,
): Promise<boolean> {
  try {
    const response = await fetch(CF_REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export interface CloudflareAccountRef {
  id: string;
  name: string | null;
}

interface AccountPayload {
  id?: string;
  name?: string;
}

/**
 * Which accounts this grant actually covers. Consent lets the owner choose, so
 * the answer is not knowable before the exchange.
 */
export async function listAuthorizedAccounts(
  accessToken: string,
): Promise<CloudflareAccountRef[]> {
  const accounts = await cfRequest<AccountPayload[]>(
    `${API_BASE}/accounts?per_page=50`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  return (accounts ?? [])
    .filter((account): account is AccountPayload & { id: string } =>
      Boolean(account?.id),
    )
    .map((account) => ({ id: account.id, name: account.name ?? null }));
}

const ACCOUNT_ID = /\b[0-9a-f]{32}\b/g;

/**
 * Account ids mentioned by the token response's `resource` field, which may be
 * a string, a list, or a URL containing the id. Purely a hint: it orders the
 * candidates when the listing is ambiguous and is ignored when it names nothing
 * the grant actually covers.
 */
export function accountHints(tokens: CloudflareTokenResponse): string[] {
  const values = Array.isArray(tokens.resource)
    ? tokens.resource
    : tokens.resource
      ? [tokens.resource]
      : [];

  return values.flatMap((value) =>
    typeof value === 'string' ? (value.match(ACCOUNT_ID) ?? []) : [],
  );
}

/**
 * Which account this connection is for. `preferred` is CLOUDFLARE_ACCOUNT_ID,
 * already configured for every environment, so an install that has always
 * pointed at one account keeps pointing at it. Only when that says nothing does
 * a hint, and then plain order, decide.
 *
 * Returning null rather than guessing across an empty list is deliberate: a
 * connection without an account id would be stored and then fail on every call.
 */
export function pickAccount(
  accounts: CloudflareAccountRef[],
  preferred?: string,
  hints: string[] = [],
): CloudflareAccountRef | null {
  if (accounts.length === 0) return null;

  const byPreference =
    preferred && accounts.find((account) => account.id === preferred);
  if (byPreference) return byPreference;

  for (const hint of hints) {
    const hinted = accounts.find((account) => account.id === hint);
    if (hinted) return hinted;
  }

  return accounts[0] ?? null;
}

/**
 * Resolves the account for a fresh grant, falling back to the configured id if
 * the listing cannot be read — `memberships.read` is the one scope whose
 * absence should degrade to "we know which account, just not its name" rather
 * than fail the whole connection.
 */
export async function resolveConnectedAccount(
  tokens: CloudflareTokenResponse,
  preferred?: string,
): Promise<CloudflareAccountRef> {
  let accounts: CloudflareAccountRef[] = [];

  try {
    accounts = await listAuthorizedAccounts(tokens.access_token);
  } catch (error) {
    if (!(error instanceof CloudflareApiError)) throw error;
    console.error(`[cf-oauth] could not list accounts: ${error.message}`);
  }

  const picked = pickAccount(accounts, preferred, accountHints(tokens));
  if (picked) return picked;

  if (preferred) return { id: preferred, name: null };

  throw new CloudflareOAuthError(
    'the grant covers no account this server can name',
  );
}
