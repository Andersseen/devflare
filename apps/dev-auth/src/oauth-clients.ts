import type { Client } from 'better-auth/plugins/oidc-provider';

/**
 * Registry of the applications allowed to authenticate through this service.
 *
 * dev-auth is an OAuth 2.1 / OIDC provider, so every consumer (DevFlare and any
 * app living in another repository) has to be registered before it can start an
 * authorization flow. For this personal-use phase registration is plain
 * configuration — there is no self-service registration endpoint and no
 * management UI:
 *
 *   OAUTH_CLIENTS         a var in wrangler.toml. Public, reviewable in git:
 *                         client id, display name, client type, redirect URIs.
 *   OAUTH_CLIENT_SECRETS  a Worker secret (`wrangler secret put`) / .dev.vars
 *                         entry mapping client id -> client secret.
 *
 * The split is deliberate: the half that must never reach git lives in secrets,
 * while the half that decides *where a browser may be sent back to* stays in
 * version control where a diff makes it obvious.
 *
 * These are handed to better-auth as `trustedClients`, which is what lets the
 * provider validate `client_id` and `redirect_uri` without a database round trip
 * — and, crucially, without accepting anything a browser makes up.
 */

/**
 * OAuth client types, as defined by better-auth. Only `public` clients may omit
 * a client secret; they authenticate with PKCE alone.
 */
const CLIENT_TYPES = ['web', 'public', 'native', 'user-agent-based'] as const;

type ClientType = (typeof CLIENT_TYPES)[number];

/** The shape a single entry of the `OAUTH_CLIENTS` JSON array must have. */
export interface OAuthClientConfig {
  clientId: string;
  name: string;
  /** Defaults to `web` (confidential — a client secret is required). */
  type?: ClientType;
  /**
   * Exact redirect URIs. The provider compares `redirect_uri` against these
   * with string equality, so list every callback the app actually uses.
   */
  redirectURIs: string[];
}

export interface ParsedClientRegistry {
  clients: Client[];
  /** Human-readable reasons why entries were rejected. Never contains secrets. */
  errors: string[];
}

function parseJson(
  raw: string | undefined,
  label: string,
): [unknown, string[]] {
  if (!raw || !raw.trim()) return [undefined, []];
  try {
    return [JSON.parse(raw), []];
  } catch {
    return [undefined, [`${label} is not valid JSON — no clients registered.`]];
  }
}

/**
 * A redirect URI is the one value in this whole flow that decides where an
 * authorization code is delivered, so it has to be an exact, absolute URL.
 * Plain http is only tolerated for loopback development hosts.
 */
function redirectUriError(uri: unknown): string | null {
  if (typeof uri !== 'string' || !uri.trim()) {
    return 'redirect URIs must be non-empty strings';
  }

  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return `"${uri}" is not an absolute URL`;
  }

  if (url.hash) return `"${uri}" must not contain a fragment`;

  // `new URL()` accepts "https://*.example.com" as a host, so parsing alone is
  // not validation. A pattern like that could never match a real redirect_uri
  // (the provider compares exact strings), so accepting it would only mislead
  // whoever wrote it into thinking wildcards work here. They do not.
  if (!/^\[?[a-z0-9.:-]+\]?$/i.test(url.hostname)) {
    return `"${uri}" has an invalid host — redirect URIs are matched exactly, wildcards are not supported`;
  }

  const isLoopback =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '[::1]';

  if (url.protocol === 'https:') return null;
  if (url.protocol === 'http:' && isLoopback) return null;

  return `"${uri}" must use https (plain http is only allowed on localhost)`;
}

function isClientType(value: unknown): value is ClientType {
  return CLIENT_TYPES.includes(value as ClientType);
}

/**
 * Turns the two configuration values into the client list better-auth trusts.
 *
 * Invalid entries are dropped and reported rather than thrown: a typo in one
 * app's redirect URI must not take email/password and GitHub sign-in down for
 * everything else. Callers log `errors` so a dropped client is still loud.
 */
export function parseOAuthClients(
  clientsJson: string | undefined,
  secretsJson: string | undefined,
): ParsedClientRegistry {
  const errors: string[] = [];

  const [parsedClients, clientsErrors] = parseJson(
    clientsJson,
    'OAUTH_CLIENTS',
  );
  errors.push(...clientsErrors);
  const [parsedSecrets, secretsErrors] = parseJson(
    secretsJson,
    'OAUTH_CLIENT_SECRETS',
  );
  errors.push(...secretsErrors);

  if (parsedClients === undefined) return { clients: [], errors };

  if (!Array.isArray(parsedClients)) {
    errors.push('OAUTH_CLIENTS must be a JSON array of client objects.');
    return { clients: [], errors };
  }

  const secrets: Record<string, string> =
    parsedSecrets &&
    typeof parsedSecrets === 'object' &&
    !Array.isArray(parsedSecrets)
      ? (parsedSecrets as Record<string, string>)
      : {};

  if (parsedSecrets !== undefined && Object.keys(secrets).length === 0) {
    errors.push('OAUTH_CLIENT_SECRETS must be a JSON object of id -> secret.');
  }

  const clients: Client[] = [];
  const seen = new Set<string>();

  for (const [index, entry] of parsedClients.entries()) {
    const where = `OAUTH_CLIENTS[${index}]`;

    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`${where}: expected an object.`);
      continue;
    }

    const config = entry as Partial<OAuthClientConfig>;
    const { clientId, name } = config;

    if (
      typeof clientId !== 'string' ||
      !clientId.trim() ||
      /\s/.test(clientId)
    ) {
      errors.push(
        `${where}: clientId must be a non-empty string with no spaces.`,
      );
      continue;
    }
    if (seen.has(clientId)) {
      errors.push(`${where}: duplicate clientId "${clientId}" — ignored.`);
      continue;
    }
    if (typeof name !== 'string' || !name.trim()) {
      errors.push(`${where} (${clientId}): name must be a non-empty string.`);
      continue;
    }

    const type = config.type ?? 'web';
    if (!isClientType(type)) {
      errors.push(
        `${where} (${clientId}): type must be one of ${CLIENT_TYPES.join(', ')}.`,
      );
      continue;
    }

    if (
      !Array.isArray(config.redirectURIs) ||
      config.redirectURIs.length === 0
    ) {
      errors.push(
        `${where} (${clientId}): redirectURIs must be a non-empty array.`,
      );
      continue;
    }

    const uriErrors = config.redirectURIs
      .map(redirectUriError)
      .filter((error): error is string => error !== null);
    if (uriErrors.length) {
      errors.push(`${where} (${clientId}): ${uriErrors.join('; ')}.`);
      continue;
    }

    const clientSecret = secrets[clientId];
    if (type !== 'public' && !clientSecret) {
      errors.push(
        `${where} (${clientId}): confidential clients need an OAUTH_CLIENT_SECRETS entry.`,
      );
      continue;
    }

    seen.add(clientId);
    clients.push({
      clientId,
      clientSecret: type === 'public' ? undefined : clientSecret,
      type,
      name,
      disabled: false,
      metadata: null,
      redirectUrls: [...config.redirectURIs],
      // Every registered client here is one of my own applications, so there is
      // nothing for the user to consent to — the consent screen exists to
      // protect users from third-party apps, and none are allowed to register.
      skipConsent: true,
    });
  }

  return { clients, errors };
}

/**
 * Origins the registered clients redirect back to. better-auth validates every
 * `callbackURL` against `trustedOrigins`, so registering a client also has to
 * make its origin trusted — otherwise the app that just completed a flow cannot
 * be used as a destination.
 */
export function clientOrigins(clients: Client[]): string[] {
  const origins = new Set<string>();
  for (const client of clients) {
    for (const uri of client.redirectUrls) {
      try {
        origins.add(new URL(uri).origin);
      } catch {
        // parseOAuthClients already rejected unparseable URIs.
      }
    }
  }
  return [...origins];
}
