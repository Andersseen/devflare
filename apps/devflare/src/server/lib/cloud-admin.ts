/**
 * Who may look at the Cloudflare account.
 *
 * A signed-in session is not enough here. The API token behind /api/v1/cloud/*
 * is account-scoped — it sees every Worker, database and bucket the owner runs —
 * so these routes are gated on being an administrator, not merely on being a
 * user DevFlare knows.
 *
 * Administrator status is asked of dev-auth rather than answered here, for the
 * reason spelled out in routes/api/admin/whoami.ts: DevFlare must not grow a
 * second admin list that can drift from `ADMIN_EMAILS`. The answer is memoized
 * briefly so the cost is one extra request per minute rather than one per call.
 */

import { createError, getQuery, type H3Event } from 'h3';
import { getAppSession, requireAuth, type AppUser } from './session';
import { callDevAuthAdmin, DevAuthAdminError } from './devauth-admin';
import {
  CloudflareApiError,
  resolveCloudflareConfig,
  type CloudflareConfig,
} from './cloudflare';

const ADMIN_TTL_MS = 60_000;

const verdicts = new Map<string, { admin: boolean; expiresAt: number }>();

/**
 * `unavailable` is not a "no": it means this server cannot ask the question
 * (DEV_AUTH_ADMIN_TOKEN missing), which callers report as a 503 and which is
 * never cached.
 */
export type CloudAdminVerdict = 'admin' | 'not-admin' | 'unavailable';

export async function cloudAdminVerdict(
  event: H3Event,
  email: string,
): Promise<CloudAdminVerdict> {
  const cached = verdicts.get(email);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.admin ? 'admin' : 'not-admin';
  }

  try {
    await callDevAuthAdmin(event, email, '/admin/settings');
    verdicts.set(email, { admin: true, expiresAt: Date.now() + ADMIN_TTL_MS });
    return 'admin';
  } catch (error) {
    if (error instanceof DevAuthAdminError) {
      if (error.status === 503) return 'unavailable';
      verdicts.set(email, {
        admin: false,
        expiresAt: Date.now() + ADMIN_TTL_MS,
      });
      return 'not-admin';
    }
    throw error;
  }
}

/**
 * Resolves the acting administrator, or throws the h3 error the route should
 * answer with: 401 signed out, 403 not an administrator, 503 when the identity
 * service cannot be asked.
 */
export async function requireCloudAdmin(event: H3Event): Promise<AppUser> {
  const user = requireAuth(await getAppSession(event));

  switch (await cloudAdminVerdict(event, user.email)) {
    case 'admin':
      return user;
    case 'unavailable':
      throw createError({
        statusCode: 503,
        statusMessage: 'Identity service is not configured on this server',
      });
    default:
      throw createError({ statusCode: 403, statusMessage: 'Forbidden' });
  }
}

/**
 * The shape every /api/v1/cloud/* route shares: prove the caller administers
 * this platform, resolve the credential, then run one or more API calls with
 * the upstream's own status preserved — a 403 from Cloudflare because the token
 * lacks a scope should not reach the browser as a 500.
 *
 * `?refresh=1` bypasses the client's 60s memo, which is what the reload button
 * in the UI sends.
 */
export async function withCloudflare<T>(
  event: H3Event,
  run: (config: CloudflareConfig, refresh: boolean) => Promise<T>,
): Promise<T> {
  await requireCloudAdmin(event);

  const refresh = getQuery(event)['refresh'] === '1';

  try {
    return await run(resolveCloudflareConfig(event.context), refresh);
  } catch (error) {
    if (error instanceof CloudflareApiError) {
      throw createError({
        statusCode: error.status,
        statusMessage: error.message,
        data: { error: error.message },
      });
    }
    throw error;
  }
}
