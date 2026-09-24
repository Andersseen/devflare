import {
  createError,
  getHeader,
  getRequestHost,
  getRequestIP,
  getRequestProtocol,
  type H3Event,
} from 'h3';
import { isAllowed, parseAllowedUsers } from './authorization';
import { binding, envVar, type DevToolsEnv } from './env';
import { checkRateLimit } from './rate-limit';
import { getSessionUser } from './session';
import type { SessionUser } from './session-store';

/**
 * The guards every connected endpoint runs, in order:
 *
 *   401 anonymous  — no DevTools session
 *   403 forbidden  — signed in, but not in DEVTOOLS_ALLOWED_USERS
 *   429 limited    — over the per-user limit for this kind of request
 *
 * Messages are fixed strings: nothing from the provider, the database or a
 * stack trace reaches the response.
 */

export async function requireSessionUser(event: H3Event): Promise<SessionUser> {
  const user = await getSessionUser(event);
  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Sign in to use connected tools',
      data: { code: 'unauthenticated' },
    });
  }
  return user;
}

export function userIsAllowed(event: H3Event, user: SessionUser): boolean {
  const policy = parseAllowedUsers(
    envVar(event.context, 'DEVTOOLS_ALLOWED_USERS'),
  );
  return isAllowed(policy, user);
}

export async function requireAllowedUser(event: H3Event): Promise<SessionUser> {
  const user = await requireSessionUser(event);
  if (!userIsAllowed(event, user)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Your account is not allowed to use connected tools',
      data: { code: 'forbidden' },
    });
  }
  return user;
}

type LimiterName = keyof Pick<
  DevToolsEnv,
  'AUTH_RATE_LIMITER' | 'MUTATION_RATE_LIMITER' | 'INSPECT_RATE_LIMITER'
>;

export async function enforceRateLimit(
  event: H3Event,
  limiter: LimiterName,
  key: string,
): Promise<void> {
  const result = await checkRateLimit(binding(event.context, limiter), key);
  if (result === 'limited') {
    throw createError({
      statusCode: 429,
      statusMessage: 'Too many requests — try again in a minute',
      data: { code: 'rate_limited' },
    });
  }
}

/** Client IP for per-IP limits: Cloudflare's header, else the socket. */
export function clientKey(event: H3Event): string {
  return (
    getHeader(event, 'cf-connecting-ip') ?? getRequestIP(event) ?? 'unknown'
  );
}

/**
 * CSRF defence for state-changing requests. The SameSite=Lax session cookie
 * already stays home on cross-site POST/PATCH/DELETE; this is the second
 * layer: the request must declare this origin (Origin header) or come from a
 * same-origin fetch (Sec-Fetch-Site), and must carry JSON — a content type an
 * HTML form cannot send.
 */
export function assertSameOriginJson(event: H3Event, hasBody = true): void {
  const origin = getHeader(event, 'origin');
  const fetchSite = getHeader(event, 'sec-fetch-site');
  const expected = `${getRequestProtocol(event)}://${getRequestHost(event)}`;

  const sameOrigin =
    origin !== undefined ? origin === expected : fetchSite === 'same-origin';

  if (!sameOrigin) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Cross-origin request refused',
      data: { code: 'csrf' },
    });
  }

  if (hasBody) {
    const type = getHeader(event, 'content-type') ?? '';
    if (!type.toLowerCase().startsWith('application/json')) {
      throw createError({
        statusCode: 415,
        statusMessage: 'Expected application/json',
        data: { code: 'unsupported_media_type' },
      });
    }
  }
}
