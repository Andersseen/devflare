import {
  createError,
  deleteCookie,
  getCookie,
  getRequestProtocol,
  setCookie,
  type H3Event,
} from 'h3';
import { db } from '../db';

/**
 * DevFlare's own session, established after the OIDC flow against dev-auth
 * completes (see ./oidc.ts).
 *
 * This replaces the previous arrangement, where every request forwarded the
 * browser's dev-auth cookie to the auth service. That made DevFlare a special
 * case — it only worked because the two share a parent domain — and it put the
 * auth service in the hot path of every authenticated request. Now DevFlare is
 * just one registered client: it authenticates once, then answers from its own
 * D1.
 *
 * `userId` is the provider's user id (the `sub` claim), so rows written before
 * this change (`projects.userId`) still resolve to the same person.
 */

const COOKIE_NAME = 'df_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface AppUser {
  id: string;
  email: string;
  name: string;
  image: string | null;
}

export interface AppSession {
  user: AppUser;
}

/**
 * Only the hash is stored, so the table cannot be turned into a set of working
 * session cookies. SHA-256 with no salt on purpose: the token is 256 bits of
 * randomness, so there is nothing to brute force and lookups stay a single
 * indexed read.
 */
async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * `Secure` everywhere except plain-http local dev, where the browser would
 * silently drop the cookie and sign-in would appear to do nothing.
 */
export function isSecureRequest(event: H3Event): boolean {
  return getRequestProtocol(event) === 'https';
}

interface Rows<T> {
  rows?: T[];
}

/** Creates the local session and sets the cookie. Returns nothing to the caller. */
export async function startSession(
  event: H3Event,
  user: AppUser,
): Promise<void> {
  const token = crypto.randomUUID() + crypto.randomUUID();
  const tokenHash = await hashToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  const nowIso = now.toISOString();

  // The provider is the source of truth for identity; this copy is what lets
  // DevFlare render a profile without calling out on every request.
  await db.sql`INSERT INTO app_user (id, email, name, image, createdAt, updatedAt)
    VALUES (${user.id}, ${user.email}, ${user.name}, ${user.image}, ${nowIso}, ${nowIso})
    ON CONFLICT(id) DO UPDATE SET email = excluded.email, image = excluded.image, updatedAt = excluded.updatedAt`;

  await db.sql`INSERT INTO app_session (tokenHash, userId, expiresAt, createdAt)
    VALUES (${tokenHash}, ${user.id}, ${expiresAt.toISOString()}, ${nowIso})`;

  setCookie(event, COOKIE_NAME, token, {
    httpOnly: true,
    // Lax, not Strict: the browser arrives here on a top-level redirect from the
    // provider, and Strict would withhold the cookie on that first navigation.
    sameSite: 'lax',
    secure: isSecureRequest(event),
    path: '/',
    expires: expiresAt,
  });
}

/** Resolves the current session, or null. */
export async function getAppSession(
  event: H3Event,
): Promise<AppSession | null> {
  const token = getCookie(event, COOKIE_NAME);
  if (!token) return null;

  const tokenHash = await hashToken(token);
  const result = await db.sql<
    Rows<{
      userId: string;
      expiresAt: string;
      email: string;
      name: string;
      image: string | null;
    }>
  >`SELECT s.userId, s.expiresAt, u.email, u.name, u.image
      FROM app_session s
      JOIN app_user u ON u.id = s.userId
      WHERE s.tokenHash = ${tokenHash}`;

  const row = result.rows?.[0];
  if (!row) return null;

  if (new Date(row.expiresAt).getTime() <= Date.now()) {
    await db.sql`DELETE FROM app_session WHERE tokenHash = ${tokenHash}`;
    return null;
  }

  return {
    user: {
      id: row.userId,
      email: row.email,
      name: row.name,
      image: row.image,
    },
  };
}

/** Drops the local session. The provider's own session is untouched. */
export async function endSession(event: H3Event): Promise<void> {
  const token = getCookie(event, COOKIE_NAME);
  if (token) {
    await db.sql`DELETE FROM app_session WHERE tokenHash = ${await hashToken(token)}`;
  }
  deleteCookie(event, COOKIE_NAME, { path: '/' });
}

export function requireAuth(session: AppSession | null): AppUser {
  if (!session?.user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }
  return session.user;
}
