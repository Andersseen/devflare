import { createError, type H3Event } from 'h3';

/**
 * Resolves the dev-auth base URL.
 *
 * On Cloudflare, `vars` from wrangler.toml arrive as a per-request binding, not
 * as `process.env` — relying on the unenv `process` shim here would be betting
 * the whole auth path on an implementation detail. Read the binding first and
 * keep `process.env` as the fallback for non-Cloudflare runtimes (vitest, plain
 * node). Local dev resolves to :8787 via the top-level var in wrangler.toml.
 */
function resolveAuthServiceUrl(event: H3Event): string {
  const cloudflareEnv = (
    event.context as {
      cloudflare?: { env?: Record<string, string | undefined> };
    }
  ).cloudflare?.env;

  return (
    cloudflareEnv?.['DEV_AUTH_URL'] ??
    process.env['DEV_AUTH_URL'] ??
    'http://localhost:8787'
  );
}

/**
 * Validates a session by calling the remote auth service (dev-auth).
 * This replaces the local `auth.api.getSession()` call.
 */
export async function getRemoteSession(event: H3Event) {
  const authServiceUrl = resolveAuthServiceUrl(event);
  const cookieHeader = event.headers.get('cookie') ?? '';

  try {
    const response = await fetch(`${authServiceUrl}/api/auth/get-session`, {
      method: 'GET',
      headers: {
        cookie: cookieHeader,
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data as {
      session?: { id: string; userId: string };
      user?: { id: string };
    } | null;
  } catch {
    return null;
  }
}

export function requireAuth(session: { user?: { id: string } } | null) {
  if (!session?.user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }
  return session.user;
}
