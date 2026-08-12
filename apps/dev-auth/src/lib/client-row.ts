/**
 * Turns a row of the `oauthClient` table into the shape the provider trusts.
 *
 * Rows reach this module from D1, where they were written by the admin API — not
 * from a reviewed diff — so nothing in a row is taken on faith. The security
 * properties that configuration guarantees structurally (see ../oauth-clients.ts)
 * are re-imposed here rather than read from columns:
 *
 *   - redirect URIs are validated with the same rules as the config path
 *   - PKCE cannot be turned off
 *   - the grant is authorization_code only; no column can widen it
 *
 * A row that fails any of that resolves to `null`, which the registry treats as
 * "no such client" — the authorization simply does not happen. Dropping the
 * client is the only safe reading: a row we cannot fully validate must never be
 * partially honoured.
 */

import type { RegisteredClient } from '../oauth-clients';
import { validateUriList } from './redirect-uri';

/** Columns as drizzle hands them back; JSON-encoded lists arrive as text. */
export interface OAuthClientRow {
  clientId?: unknown;
  clientSecret?: unknown;
  name?: unknown;
  type?: unknown;
  public?: unknown;
  redirectUris?: unknown;
  postLogoutRedirectUris?: unknown;
  skipConsent?: unknown;
  enableEndSession?: unknown;
  disabled?: unknown;
}

const PUBLIC_CLIENT_TYPES: ReadonlySet<string> = new Set([
  'native',
  'user-agent-based',
]);

/**
 * The list columns are text in SQLite but some adapters hand back an array
 * already. Accept both; anything else is not a list.
 */
function parseList(value: unknown): string[] | null {
  if (Array.isArray(value)) {
    return value.every((entry) => typeof entry === 'string')
      ? (value as string[])
      : null;
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) &&
      parsed.every((entry) => typeof entry === 'string')
      ? (parsed as string[])
      : null;
  } catch {
    return null;
  }
}

/** SQLite has no boolean; drizzle may hand back 0/1 or true/false. */
function asBoolean(value: unknown): boolean {
  return value === true || value === 1;
}

export function toRegisteredClient(
  row: OAuthClientRow | null | undefined,
): RegisteredClient | null {
  if (!row) return null;

  const { clientId, name } = row;
  if (typeof clientId !== 'string' || !clientId.trim() || /\s/.test(clientId)) {
    return null;
  }

  // A disabled row is a client that exists but must not authorize. Returning
  // null is what makes that true at every call site at once.
  if (asBoolean(row.disabled)) return null;

  const rawRedirects = parseList(row.redirectUris);
  if (!rawRedirects || rawRedirects.length === 0) return null;

  const redirects = validateUriList(rawRedirects, 'redirectUris');
  if (redirects.errors.length) return null;

  const postLogout = validateUriList(
    parseList(row.postLogoutRedirectUris) ?? [],
    'postLogoutRedirectUris',
  );
  if (postLogout.errors.length) return null;

  const type =
    row.type === 'native' || row.type === 'user-agent-based' ? row.type : 'web';
  const isPublic = PUBLIC_CLIENT_TYPES.has(type);
  const clientSecret =
    typeof row.clientSecret === 'string' && row.clientSecret
      ? row.clientSecret
      : undefined;

  // A confidential client with no stored secret could otherwise reach the token
  // endpoint with nothing to prove; a public client holding one is a mistake
  // about what the client can keep. Neither is registered.
  if (!isPublic && !clientSecret) return null;
  if (isPublic && clientSecret) return null;

  return {
    clientId,
    clientSecret,
    name: typeof name === 'string' && name.trim() ? name : clientId,
    type,
    public: isPublic,
    tokenEndpointAuthMethod: isPublic ? 'none' : 'client_secret_basic',
    redirectUris: redirects.uris,
    postLogoutRedirectUris: postLogout.uris,
    enableEndSession: asBoolean(row.enableEndSession),
    // Not read from the row. Configuration cannot turn PKCE off either, and a
    // column that could would be the most valuable thing in the table to write.
    requirePKCE: true,
    // Read from the row, unlike the config path's blanket `true`. Config clients
    // are hand-written and all mine; a row can be created from a form, so the
    // consent screen is the default and skipping it is an explicit choice.
    skipConsent: asBoolean(row.skipConsent),
    disabled: false,
    grantTypes: ['authorization_code'],
    responseTypes: ['code'],
  };
}
