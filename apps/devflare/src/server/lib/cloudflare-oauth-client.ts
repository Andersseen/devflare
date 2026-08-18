/**
 * Which OAuth client the Cloudflare connection is made with, and where that
 * answer comes from.
 *
 * Spec 007 read it from `CLOUDFLARE_OAUTH_CLIENT_ID` and
 * `CLOUDFLARE_OAUTH_CLIENT_SECRET`. That makes connecting a deployment the
 * privilege of whoever can run `wrangler secret put`, which is why the live
 * site sat unconnected for a week showing the "paste an API token" prompt.
 * Spec 010 lets an administrator enter the client from Settings instead.
 *
 * Order is database, then environment — the same order dev-auth resolves its
 * provider settings in, and for the same reason: what someone just typed must
 * win over what was deployed months ago.
 *
 * One exception, also borrowed from dev-auth: a stored secret that cannot be
 * decrypted does **not** fall back to the environment. Rotating
 * SECRET_ENCRYPTION_KEY would otherwise look like it worked while quietly
 * running on a different client — and a different client cannot renew the grant
 * the stored one made anyway.
 */

import { db } from '../db';
import { rowsOf } from './project-rows';
import { open, seal, SecretBoxError } from './secret-box';
import type { RequestContext } from './cloudflare';
import {
  encryptionKey,
  envCloudflareOAuthConfig,
  oauthRedirectUri,
  type CloudflareOAuthConfig,
} from './cloudflare-oauth';

/** One row, for the same reason `cloudflare_connection` has one. */
const ROW_ID = 'default';

export interface OAuthClientRow {
  id: string;
  clientId: string;
  /** Sealed with SECRET_ENCRYPTION_KEY. */
  clientSecret: string;
  updatedBy: string;
  updatedAt: string;
}

/** Where the client in use came from. */
export type OAuthClientSource = 'database' | 'environment' | 'none';

/** What the browser is told. Never carries a secret, sealed or otherwise. */
export interface OAuthClientView {
  clientId: string | null;
  source: OAuthClientSource;
  secretConfigured: boolean;
  /** A stored secret this key cannot open — a rotation, almost always. */
  secretUnreadable: boolean;
  /** Null when this deployment has no CLOUDFLARE_OAUTH_REDIRECT_URI. */
  redirectUri: string | null;
  encryptionKeyConfigured: boolean;
  /** When the stored client was last written. Null when it comes from the env. */
  updatedAt: string | null;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/**
 * Null both when there is no row and when the table cannot be read — a
 * deployment whose migration has not been applied yet keeps working on its
 * environment variables rather than failing, which is the whole point of
 * keeping them as a fallback.
 */
export async function readOAuthClientRow(): Promise<OAuthClientRow | null> {
  try {
    const result = await db.sql`SELECT id, clientId, clientSecret, updatedBy,
        updatedAt FROM cloudflare_oauth_client WHERE id = ${ROW_ID}`;

    return rowsOf<OAuthClientRow>(result)[0] ?? null;
  } catch (error) {
    console.error(
      `[cf-oauth] could not read the stored OAuth client: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    );
    return null;
  }
}

export class OAuthClientError extends Error {}

/**
 * Stores the client. A null `clientSecret` means "keep the one already there",
 * as the GitHub card in Settings → Identity already behaves — so a client id
 * can be corrected without re-entering the secret.
 */
export async function saveOAuthClient(
  context: RequestContext,
  input: { clientId: string; clientSecret: string | null; userId: string },
): Promise<void> {
  const clientId = input.clientId.trim();
  if (!clientId) throw new OAuthClientError('a client id is required');

  const now = new Date().toISOString();

  if (!input.clientSecret) {
    const existing = await readOAuthClientRow();
    if (!existing) {
      throw new OAuthClientError(
        'a client secret is required the first time a client is stored',
      );
    }

    await db.sql`UPDATE cloudflare_oauth_client
      SET clientId = ${clientId}, updatedBy = ${input.userId}, updatedAt = ${now}
      WHERE id = ${ROW_ID}`;
    return;
  }

  const key = encryptionKey(context);
  if (!key) {
    throw new OAuthClientError(
      'SECRET_ENCRYPTION_KEY is not set, so a client secret cannot be stored',
    );
  }

  const sealed = await seal(input.clientSecret, key);

  await db.sql`INSERT INTO cloudflare_oauth_client
      (id, clientId, clientSecret, updatedBy, updatedAt)
    VALUES (${ROW_ID}, ${clientId}, ${sealed}, ${input.userId}, ${now})
    ON CONFLICT(id) DO UPDATE SET
      clientId = excluded.clientId,
      clientSecret = excluded.clientSecret,
      updatedBy = excluded.updatedBy,
      updatedAt = excluded.updatedAt`;
}

/** Forgets the stored client; the environment variables take over again. */
export async function clearOAuthClient(): Promise<void> {
  await db.sql`DELETE FROM cloudflare_oauth_client WHERE id = ${ROW_ID}`;
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * The client every part of the connect flow runs on: the stored one when there
 * is a usable one, the deployed one otherwise, null when this server has
 * neither.
 *
 * Asynchronous since spec 010 because it reads D1. Every caller was already in
 * an async function, so this costs an `await` and nothing else.
 */
export async function resolveCloudflareOAuthConfig(
  context: RequestContext,
): Promise<CloudflareOAuthConfig | null> {
  const row = await readOAuthClientRow();
  if (!row) return envCloudflareOAuthConfig(context);

  const redirectUri = oauthRedirectUri(context);
  const key = encryptionKey(context);

  // A stored client with nowhere to send the owner back is not usable, and
  // neither is one whose secret cannot be opened. Both are refusals rather than
  // silent fallbacks — see the note at the top of this file.
  if (!redirectUri || !key) return null;

  try {
    return {
      clientId: row.clientId,
      clientSecret: await open(row.clientSecret, key),
      redirectUri,
    };
  } catch (error) {
    if (!(error instanceof SecretBoxError)) throw error;
    console.error(
      '[cf-oauth] the stored client secret could not be decrypted — has SECRET_ENCRYPTION_KEY changed?',
    );
    return null;
  }
}

/** What `GET /api/v1/cloud/oauth-client` answers. */
export async function oauthClientView(
  context: RequestContext,
): Promise<OAuthClientView> {
  const row = await readOAuthClientRow();
  const key = encryptionKey(context);
  const redirectUri = oauthRedirectUri(context) ?? null;

  if (row) {
    let secretUnreadable = !key;

    if (key) {
      try {
        await open(row.clientSecret, key);
      } catch (error) {
        if (!(error instanceof SecretBoxError)) throw error;
        secretUnreadable = true;
      }
    }

    return {
      clientId: row.clientId,
      source: 'database',
      secretConfigured: !secretUnreadable,
      secretUnreadable,
      redirectUri,
      encryptionKeyConfigured: Boolean(key),
      updatedAt: row.updatedAt,
    };
  }

  const fromEnv = envCloudflareOAuthConfig(context);

  return {
    clientId: fromEnv?.clientId ?? null,
    source: fromEnv ? 'environment' : 'none',
    secretConfigured: Boolean(fromEnv),
    secretUnreadable: false,
    redirectUri,
    encryptionKeyConfigured: Boolean(key),
    updatedAt: null,
  };
}
