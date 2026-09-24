import type { SqlDatabase } from '../db';

/**
 * DevTools' own application session — the `dt_session` cookie, never
 * DevFlare's `df_session` and never DevAuth's own cookie. Established once by
 * the OIDC callback; after that DevTools answers from its own D1 and never
 * asks DevAuth on a request. No OAuth token is kept: the access token is used
 * once, server side, for userinfo, and then dropped.
 *
 * h3-free (the cookie half is ./session.ts) so it runs under test against the
 * real migrations.
 */

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  image: string | null;
}

interface Rows<T> {
  rows?: T[];
}

/**
 * Only the hash is stored. Unsalted SHA-256 is enough: the token is 256 bits
 * of randomness, so there is nothing to brute force, and lookups stay one
 * indexed read.
 */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Creates a brand-new session for `user`. Always a fresh token — a session id
 * that existed before sign-in is never promoted, which is what rules out
 * session fixation.
 */
export async function createSession(
  db: SqlDatabase,
  user: SessionUser,
  now = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken();
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  const nowIso = now.toISOString();

  await db.sql`INSERT INTO app_user (id, email, name, image, created_at, updated_at)
    VALUES (${user.id}, ${user.email}, ${user.name}, ${user.image}, ${nowIso}, ${nowIso})
    ON CONFLICT(id) DO UPDATE SET email = excluded.email, name = excluded.name,
      image = excluded.image, updated_at = excluded.updated_at`;

  await db.sql`INSERT INTO app_session (token_hash, user_id, expires_at, created_at)
    VALUES (${tokenHash}, ${user.id}, ${expiresAt.toISOString()}, ${nowIso})`;

  return { token, expiresAt };
}

export async function findSession(
  db: SqlDatabase,
  token: string,
  now = new Date(),
): Promise<SessionUser | null> {
  const tokenHash = await hashToken(token);
  const result = await db.sql<
    Rows<{
      user_id: string;
      expires_at: string;
      email: string;
      name: string;
      image: string | null;
    }>
  >`SELECT s.user_id, s.expires_at, u.email, u.name, u.image
      FROM app_session s
      JOIN app_user u ON u.id = s.user_id
      WHERE s.token_hash = ${tokenHash}`;

  const row = result.rows?.[0];
  if (!row) return null;

  if (new Date(row.expires_at).getTime() <= now.getTime()) {
    await db.sql`DELETE FROM app_session WHERE token_hash = ${tokenHash}`;
    return null;
  }

  return {
    id: row.user_id,
    email: row.email,
    name: row.name,
    image: row.image,
  };
}

export async function deleteSession(
  db: SqlDatabase,
  token: string,
): Promise<void> {
  await db.sql`DELETE FROM app_session WHERE token_hash = ${await hashToken(token)}`;
}
