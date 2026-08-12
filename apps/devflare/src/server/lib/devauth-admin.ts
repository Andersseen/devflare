/**
 * DevFlare's back-channel client for dev-auth's admin API.
 *
 * The browser never talks to dev-auth. It calls DevFlare same-origin with
 * DevFlare's own session cookie, and DevFlare's server calls dev-auth from here
 * with a service token, naming the human it is acting for. Two reasons that is
 * worth the extra hop: no CORS exception on the most security-critical API in
 * the system, and no admin credential ever reaching a browser.
 *
 * dev-auth re-checks the forwarded actor against its own `ADMIN_EMAILS`, so
 * being able to reach these routes is not the same as being allowed to use them
 * — this server is a courier, not the authority.
 */

/** Raised when the provider answers with an error we should surface verbatim. */
export class DevAuthAdminError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'DevAuthAdminError';
  }
}

export interface RequestContext {
  cloudflare?: { env?: Record<string, string | undefined> };
}

/**
 * Just enough of an h3 event to read configuration from. `h3` is deliberately
 * not imported — the same choice ./oidc.ts makes and for the same reason: it
 * keeps this module plain, testable code with no framework dependency.
 */
export interface ContextCarrier {
  context: RequestContext;
}

/**
 * On Cloudflare, vars arrive as a per-request binding rather than as
 * `process.env` — the same reasoning as server/lib/oidc.ts, which is the other
 * place this app reads configuration on the auth path.
 */
function env(context: RequestContext, key: string): string | undefined {
  return context.cloudflare?.env?.[key] ?? process.env[key];
}

export interface DevAuthAdminConfig {
  issuer: string;
  token: string;
}

export function resolveAdminConfig(
  context: RequestContext,
): DevAuthAdminConfig {
  const issuer = (
    env(context, 'DEV_AUTH_URL') ?? 'http://localhost:8787'
  ).replace(/\/$/, '');
  const token = env(context, 'DEV_AUTH_ADMIN_TOKEN') ?? '';

  if (!token) {
    // Better a clear 503 than a confusing 401 from the provider.
    throw new DevAuthAdminError(
      'DEV_AUTH_ADMIN_TOKEN is not configured on this server',
      503,
    );
  }

  return { issuer, token };
}

/**
 * Calls dev-auth as `actorEmail`. The path is appended to the provider's origin,
 * never taken from the browser, so a caller cannot steer this at another host.
 */
export async function callDevAuthAdmin<T>(
  event: ContextCarrier,
  actorEmail: string,
  path: `/admin/${string}`,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const config = resolveAdminConfig(event.context);

  const response = await fetch(`${config.issuer}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'x-devauth-actor': actorEmail,
      ...(init.body === undefined
        ? {}
        : { 'Content-Type': 'application/json' }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const text = await response.text();
  const payload = text ? safeParse(text) : null;

  if (!response.ok) {
    // The provider's message is written for an operator and names no secret, so
    // it is more useful forwarded than replaced with something generic.
    throw new DevAuthAdminError(
      (payload as { error?: string } | null)?.error ??
        `dev-auth responded ${response.status}`,
      response.status,
    );
  }

  return payload as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
