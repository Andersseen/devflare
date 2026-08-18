/**
 * The stored half of spec 007: one Cloudflare OAuth grant, kept in D1, renewed
 * on demand, and handed to the rest of the server as the same
 * `CloudflareConfig` a hand-made API token produced.
 *
 * Everything under /api/v1/cloud/* asks for that config and does not care where
 * it came from — which is the point. A connection made from the consent screen
 * and a `CLOUDFLARE_API_TOKEN` in a Worker secret are interchangeable here, so
 * the Cloud pages (spec 005) and Pages direct upload (spec 006) needed no
 * changes to work either way.
 *
 * Order of preference: a usable OAuth connection, then the environment token.
 * Not the reverse — an owner who has just consented on screen should not find
 * the app still using a stale token nobody remembers creating.
 */

import { db } from '../db';
import { rowsOf } from './project-rows';
import { open, seal, SecretBoxError } from './secret-box';
import {
  CloudflareApiError,
  isCloudflareConfigured,
  resolveCloudflareConfig,
  type CloudflareConfig,
  type RequestContext,
} from './cloudflare';
import {
  CloudflareOAuthError,
  encryptionKey,
  refreshTokens,
  revokeToken,
  type CloudflareAccountRef,
  type CloudflareTokenResponse,
} from './cloudflare-oauth';
import { resolveCloudflareOAuthConfig } from './cloudflare-oauth-client';

/** There is one connection per install. See the migration for why. */
const ROW_ID = 'default';

/**
 * Renew this long before the 900-second token actually expires. Wide enough
 * that a request which resolves the credential and then spends a few seconds
 * uploading assets does not have it expire mid-flight.
 */
export const EARLY_REFRESH_MS = 120_000;

export interface ConnectionRow {
  id: string;
  accountId: string;
  accountName: string | null;
  scope: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string;
  connectedBy: string;
  connectedAt: string;
  updatedAt: string;
}

/** How the connection is described to the browser. Never includes a token. */
export interface CloudConnection {
  kind: 'oauth' | 'token' | 'none';
  accountId: string | null;
  accountName: string | null;
  scope: string | null;
  connectedAt: string | null;
  expiresAt: string | null;
  /** A grant that exists but can no longer be renewed. */
  needsReconnect: boolean;
}

export const NO_CONNECTION: CloudConnection = {
  kind: 'none',
  accountId: null,
  accountName: null,
  scope: null,
  connectedAt: null,
  expiresAt: null,
  needsReconnect: false,
};

// ---------------------------------------------------------------------------
// Pure decisions — the part worth testing without a database.
// ---------------------------------------------------------------------------

/** ISO expiry for a token response. Defaults to Cloudflare's documented 900s. */
export function expiresAtFrom(
  expiresIn: number | undefined,
  now = Date.now(),
): string {
  const seconds =
    typeof expiresIn === 'number' && Number.isFinite(expiresIn) && expiresIn > 0
      ? expiresIn
      : 900;
  return new Date(now + seconds * 1000).toISOString();
}

/** True when the access token is expired, unreadable, or about to expire. */
export function isExpiring(expiresAt: string, now = Date.now()): boolean {
  const at = Date.parse(expiresAt);
  if (Number.isNaN(at)) return true;
  return at - now <= EARLY_REFRESH_MS;
}

/**
 * A row whose access token is spent and whose refresh token is gone. Only a new
 * consent can fix it, so the UI says so rather than showing a working section
 * that quietly 403s.
 */
export function needsReconnect(row: ConnectionRow, now = Date.now()): boolean {
  return !row.refreshToken && isExpiring(row.expiresAt, now);
}

export function toConnection(
  row: ConnectionRow,
  now = Date.now(),
): CloudConnection {
  return {
    kind: 'oauth',
    accountId: row.accountId,
    accountName: row.accountName,
    scope: row.scope,
    connectedAt: row.connectedAt,
    expiresAt: row.expiresAt,
    needsReconnect: needsReconnect(row, now),
  };
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export async function readConnectionRow(): Promise<ConnectionRow | null> {
  const result = await db.sql`SELECT id, accountId, accountName, scope,
      accessToken, refreshToken, expiresAt, connectedBy, connectedAt, updatedAt
    FROM cloudflare_connection WHERE id = ${ROW_ID}`;

  return rowsOf<ConnectionRow>(result)[0] ?? null;
}

export async function saveConnection(
  context: RequestContext,
  input: {
    tokens: CloudflareTokenResponse;
    account: CloudflareAccountRef;
    userId: string;
  },
): Promise<void> {
  const key = encryptionKey(context);
  if (!key) {
    throw new CloudflareOAuthError(
      'SECRET_ENCRYPTION_KEY is not set; refusing to store a token unencrypted',
    );
  }

  const now = new Date().toISOString();
  const accessToken = await seal(input.tokens.access_token, key);
  const refreshToken = input.tokens.refresh_token
    ? await seal(input.tokens.refresh_token, key)
    : null;

  // `connectedAt` survives a reconnection of the same account on purpose: it
  // answers "since when has this been wired up", not "when was the last token
  // minted" — that is `updatedAt`.
  await db.sql`INSERT INTO cloudflare_connection
      (id, accountId, accountName, scope, accessToken, refreshToken, expiresAt,
       connectedBy, connectedAt, updatedAt)
    VALUES (${ROW_ID}, ${input.account.id}, ${input.account.name},
       ${input.tokens.scope ?? ''}, ${accessToken}, ${refreshToken},
       ${expiresAtFrom(input.tokens.expires_in)}, ${input.userId}, ${now}, ${now})
    ON CONFLICT(id) DO UPDATE SET
      accountId = excluded.accountId,
      accountName = excluded.accountName,
      scope = excluded.scope,
      accessToken = excluded.accessToken,
      refreshToken = excluded.refreshToken,
      expiresAt = excluded.expiresAt,
      connectedBy = excluded.connectedBy,
      updatedAt = excluded.updatedAt`;
}

/**
 * Revokes upstream, then forgets the connection. The delete happens even if the
 * revocation fails, or a grant Cloudflare has already dropped could never be
 * cleared from this side.
 */
export async function clearConnection(context: RequestContext): Promise<void> {
  const row = await readConnectionRow();
  const config = await resolveCloudflareOAuthConfig(context);
  const key = encryptionKey(context);

  if (row && config && key) {
    // The refresh token is the one worth revoking: it is what outlives the
    // request. Revoking it invalidates the access token with it.
    const sealed = row.refreshToken ?? row.accessToken;
    try {
      await revokeToken(config, await open(sealed, key));
    } catch (error) {
      if (!(error instanceof SecretBoxError)) throw error;
      console.error('[cf-oauth] could not decrypt a token to revoke it');
    }
  }

  await db.sql`DELETE FROM cloudflare_connection WHERE id = ${ROW_ID}`;
}

// ---------------------------------------------------------------------------
// Credential resolution
// ---------------------------------------------------------------------------

/**
 * Cloudflare rotates refresh tokens, so two requests refreshing at once would
 * each spend a token the other has already replaced and the connection would
 * die. One in-flight refresh per isolate is enough to stop the common case: a
 * page that fires several Cloud requests at the same moment.
 */
let refreshInFlight: Promise<CloudflareConfig> | null = null;

async function refreshConnection(
  context: RequestContext,
  row: ConnectionRow,
  key: string,
): Promise<CloudflareConfig> {
  const config = await resolveCloudflareOAuthConfig(context);
  if (!config) {
    throw new CloudflareApiError(
      'this server has a Cloudflare connection but no OAuth client to renew it with',
      503,
    );
  }

  const refreshToken = await open(row.refreshToken as string, key);

  let tokens: CloudflareTokenResponse;
  try {
    tokens = await refreshTokens(config, refreshToken);
  } catch (error) {
    if (
      error instanceof CloudflareOAuthError &&
      error.code === 'invalid_grant'
    ) {
      // Revoked from the dashboard, or the rotation was lost. Drop the refresh
      // token so the row reads as "reconnect" instead of retrying forever.
      await db.sql`UPDATE cloudflare_connection
        SET refreshToken = NULL, updatedAt = ${new Date().toISOString()}
        WHERE id = ${ROW_ID}`;
    }
    throw error;
  }

  await saveConnection(context, {
    tokens: {
      ...tokens,
      // A rotation that returns no new refresh token means the old one stands.
      refresh_token: tokens.refresh_token ?? refreshToken,
      scope: tokens.scope ?? row.scope,
    },
    account: { id: row.accountId, name: row.accountName },
    userId: row.connectedBy,
  });

  return { accountId: row.accountId, token: tokens.access_token };
}

function fromEnvironment(context: RequestContext): CloudflareConfig | null {
  return isCloudflareConfigured(context)
    ? resolveCloudflareConfig(context)
    : null;
}

/**
 * The credential every /api/v1/cloud/* route runs on. Throws
 * `CloudflareApiError` so `withCloudflare` reports it with the status it
 * deserves — a server that is not connected is a 503, not a 500.
 */
export async function resolveCloudflareCredential(
  context: RequestContext,
): Promise<CloudflareConfig> {
  const row = await readConnectionRow();
  const key = encryptionKey(context);

  if (row && key) {
    try {
      if (!isExpiring(row.expiresAt)) {
        return {
          accountId: row.accountId,
          token: await open(row.accessToken, key),
        };
      }

      if (row.refreshToken) {
        refreshInFlight ??= refreshConnection(context, row, key).finally(() => {
          refreshInFlight = null;
        });
        return await refreshInFlight;
      }
    } catch (error) {
      // A failure to renew must not take the Cloud section down when there is
      // still a working token in the environment — but it must be visible.
      console.error(
        `[cf-oauth] connection unusable: ${error instanceof Error ? error.message : 'unknown error'}`,
      );

      const fallback = fromEnvironment(context);
      if (fallback) return fallback;

      throw new CloudflareApiError(
        'the Cloudflare connection could not be renewed — reconnect the account',
        503,
      );
    }
  }

  const fallback = fromEnvironment(context);
  if (fallback) return fallback;

  if (row) {
    throw new CloudflareApiError(
      key
        ? 'the Cloudflare connection has expired — reconnect the account'
        : 'SECRET_ENCRYPTION_KEY is not set, so the stored Cloudflare connection cannot be read',
      503,
    );
  }

  throw new CloudflareApiError(
    'no Cloudflare account is connected to this server',
    503,
  );
}

export interface CloudflareConnectionState {
  /** Whether anything at all can call the Cloudflare API right now. */
  configured: boolean;
  /** Whether the connect flow can even be offered. */
  canConnect: boolean;
  connection: CloudConnection;
}

/** What `/api/v1/cloud/status` reports. Reads no token and renews nothing. */
export async function cloudflareConnectionState(
  context: RequestContext,
): Promise<CloudflareConnectionState> {
  const canConnect = Boolean(
    (await resolveCloudflareOAuthConfig(context)) && encryptionKey(context),
  );
  const hasEnvToken = isCloudflareConfigured(context);
  const row = await readConnectionRow();

  if (!row) {
    return {
      configured: hasEnvToken,
      canConnect,
      connection: hasEnvToken
        ? { ...NO_CONNECTION, kind: 'token' }
        : NO_CONNECTION,
    };
  }

  const connection = toConnection(row);
  if (!connection.needsReconnect) {
    return { configured: true, canConnect, connection };
  }

  // Stale grant. It still names the account, and the environment token — if
  // there is one — is what the section is actually running on until it is
  // reconnected.
  return {
    configured: hasEnvToken,
    canConnect,
    connection: { ...connection, kind: hasEnvToken ? 'token' : 'oauth' },
  };
}
