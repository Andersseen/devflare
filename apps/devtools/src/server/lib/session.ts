import {
  deleteCookie,
  getCookie,
  getRequestProtocol,
  setCookie,
  type H3Event,
} from 'h3';
import { db } from '../db';
import {
  createSession,
  deleteSession,
  findSession,
  type SessionUser,
} from './session-store';

/** The cookie half of DevTools' session; storage is ./session-store.ts. */

const COOKIE_NAME = 'dt_session';

/**
 * `Secure` everywhere except plain-http local dev, where the browser would
 * drop the cookie and sign-in would silently do nothing.
 */
export function isSecureRequest(event: H3Event): boolean {
  return getRequestProtocol(event) === 'https';
}

export async function startSession(
  event: H3Event,
  user: SessionUser,
): Promise<void> {
  // A cookie that was already there (a stale session, or one planted before
  // sign-in) is ended, not reused.
  const previous = getCookie(event, COOKIE_NAME);
  if (previous) await deleteSession(db, previous);

  const { token, expiresAt } = await createSession(db, user);
  setCookie(event, COOKIE_NAME, token, {
    httpOnly: true,
    // Lax, not Strict: the browser arrives on a top-level redirect from
    // DevAuth, and Strict would withhold the cookie on that navigation. Lax
    // still withholds it from cross-site POST/PATCH/DELETE.
    sameSite: 'lax',
    secure: isSecureRequest(event),
    path: '/',
    expires: expiresAt,
  });
}

export async function getSessionUser(
  event: H3Event,
): Promise<SessionUser | null> {
  const token = getCookie(event, COOKIE_NAME);
  if (!token) return null;
  return findSession(db, token);
}

/** Ends DevTools' session only; the DevAuth session is untouched. */
export async function endSession(event: H3Event): Promise<void> {
  const token = getCookie(event, COOKIE_NAME);
  if (token) await deleteSession(db, token);
  deleteCookie(event, COOKIE_NAME, { path: '/' });
}
