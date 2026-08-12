/**
 * Who is allowed to administer this provider, and how that is established.
 *
 * Administration means editing the OAuth client registry — the redirect-URI
 * list, which is the single most security-critical value here: whoever writes it
 * can redirect authorization codes and take over accounts across every app on
 * this SSO. So this module is deliberately small and deliberately strict.
 *
 * Admin is decided by `ADMIN_EMAILS`, not by a column on `user`. No schema
 * change, no bootstrap problem, and — the reason it beats a column — an attacker
 * who can write the database still cannot promote themselves to admin.
 *
 * Two kinds of caller reach the admin API, and the acting human is checked the
 * same way for both:
 *
 *   Session cookie   a browser on this Worker's own origin.
 *   Service token    another server of mine (DevFlare's dashboard, spec 004)
 *                    calling back-channel and naming the human it acts for.
 */

import type { Context } from 'hono';
import type { Env } from '../index';
import { createAuth } from '../auth.config';
import { constantTimeEqual } from './client-secret';

/** Header a token-authenticated caller uses to name the human it acts for. */
const ACTOR_HEADER = 'x-devauth-actor';

/**
 * Header a cookie-authenticated mutation must carry. A cross-site form post
 * cannot set it, which is what keeps a logged-in admin's browser from being
 * driven into a write by another site. Token callers are exempt: a service token
 * is not something a cross-site attacker has in the first place.
 */
const CSRF_HEADER = 'x-devauth-admin';

export interface Actor {
  email: string;
  /** Absent for a service-token caller — it names a human, not a session. */
  userId?: string;
  via: 'session' | 'service-token';
}

export type AdminResult =
  | { ok: true; actor: Actor }
  | { ok: false; status: 401 | 403; error: string };

export function parseAdminEmails(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((address) => address.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Unlike `SIGNUP_ALLOWLIST`, an empty list here denies everyone rather than
 * allowing everyone. An unset variable is a provider with no administrators,
 * which is the safe reading of "not configured" for this particular power.
 */
export function isAdminEmail(email: string, admins: string[]): boolean {
  if (admins.length === 0) return false;
  return admins.includes(email.trim().toLowerCase());
}

/**
 * Resolves the acting human, or explains why there is not one.
 *
 * The service token is checked *before* the actor header is read, and that
 * ordering is the security property: `x-devauth-actor` is attacker-controlled
 * text on any request that did not present the token, so it is never consulted
 * on one. With the token present the caller is one of my own servers, and the
 * header is how it forwards the person who clicked.
 *
 * Presenting the token still does not make the caller an admin. The forwarded
 * human is checked against `ADMIN_EMAILS` too — without that, DevFlare's server
 * would be a confused deputy that any DevFlare user could drive into
 * administering the provider.
 */
export async function authenticateAdmin(
  c: Context<{ Bindings: Env }>,
): Promise<AdminResult> {
  const admins = parseAdminEmails(c.env.ADMIN_EMAILS);
  const presentedToken = bearerToken(c.req.header('Authorization'));
  const expectedToken = c.env.ADMIN_API_TOKEN;

  if (presentedToken && expectedToken) {
    if (!constantTimeEqual(presentedToken, expectedToken)) {
      return { ok: false, status: 401, error: 'invalid service token' };
    }

    const actorEmail = c.req.header(ACTOR_HEADER)?.trim();
    if (!actorEmail) {
      // A token with no named human would produce audit rows attributable to a
      // machine, which defeats the point of auditing this at all.
      return {
        ok: false,
        status: 403,
        error: `service token requires a ${ACTOR_HEADER} header`,
      };
    }
    if (!isAdminEmail(actorEmail, admins)) {
      return { ok: false, status: 403, error: 'not an administrator' };
    }

    return {
      ok: true,
      actor: { email: actorEmail.toLowerCase(), via: 'service-token' },
    };
  }

  // A bearer token that matches nothing configured is a failed attempt, not an
  // anonymous request; falling through to the cookie would report it as such.
  if (presentedToken) {
    return { ok: false, status: 401, error: 'invalid service token' };
  }

  const auth = await createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user?.email) {
    return { ok: false, status: 401, error: 'not signed in' };
  }
  if (!isAdminEmail(session.user.email, admins)) {
    return { ok: false, status: 403, error: 'not an administrator' };
  }

  return {
    ok: true,
    actor: {
      email: session.user.email.toLowerCase(),
      userId: session.user.id,
      via: 'session',
    },
  };
}

function bearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || undefined;
}

/** Whether a state-changing request carries what CSRF protection requires. */
export function hasCsrfHeader(c: Context<{ Bindings: Env }>): boolean {
  return c.req.header(CSRF_HEADER) === '1';
}
