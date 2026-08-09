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
 * What this module produces is fed to the provider through ./client-registry.ts,
 * which answers the plugin's client lookups from this list instead of from D1.
 * Nothing here is ever written to the database, so removing a client from
 * configuration removes it from the provider on the next deploy — there is no
 * stale row left behind that could still complete an authorization.
 */

import { hashClientSecret } from './lib/client-secret';

/**
 * OAuth client types, as defined by RFC 6749 §2.1 and understood by the
 * provider plugin. `web` is confidential (keeps a client secret); the other two
 * are public (cannot keep one, and authenticate with PKCE alone).
 */
const CLIENT_TYPES = ['web', 'native', 'user-agent-based'] as const;

type ClientType = (typeof CLIENT_TYPES)[number];

const PUBLIC_CLIENT_TYPES: ReadonlySet<string> = new Set([
  'native',
  'user-agent-based',
]);

/**
 * Client secrets shorter than this are reported, not rejected. They are still
 * usable — dropping a client for a short secret would take a working consumer
 * offline the moment this service is deployed, which is a worse failure than
 * the one it would be protecting against.
 */
const RECOMMENDED_SECRET_LENGTH = 32;

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
  /**
   * Exact post-logout redirect URIs. Only meaningful with `enableEndSession`;
   * they are where `/oauth2/end-session` may return the browser to.
   */
  postLogoutRedirectURIs?: string[];
  /**
   * Lets this client end the provider session through RP-initiated logout.
   * Off unless asked for, because it lets a client log the user out of every
   * *other* client too.
   */
  enableEndSession?: boolean;
}

/**
 * A client in the shape the provider plugin reads. Field names are the plugin's
 * schema field names — ./client-registry.ts hands these records straight back
 * as if they had been loaded from the `oauthClient` table.
 */
export interface RegisteredClient {
  clientId: string;
  /** Stored form (see ./lib/client-secret.ts), never the configured plaintext. */
  clientSecret?: string;
  name: string;
  type: ClientType;
  public: boolean;
  tokenEndpointAuthMethod: 'client_secret_basic' | 'none';
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  enableEndSession: boolean;
  /** Always true. Configuration cannot turn PKCE off for a registered client. */
  requirePKCE: true;
  /** Always true: every registered client is one of my own applications. */
  skipConsent: true;
  disabled: false;
  grantTypes: ['authorization_code'];
  responseTypes: ['code'];
}

export interface ParsedClientRegistry {
  clients: RegisteredClient[];
  /**
   * Why entries were rejected. A rejected entry is not registered at all.
   * Never contains secrets.
   */
  errors: string[];
  /**
   * Weaknesses that did not justify dropping a working client. Never contains
   * secrets.
   */
  warnings: string[];
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

  // Userinfo in a redirect target is never intentional here, and it is a classic
  // way to make a URL read as one host while resolving to another.
  if (url.username || url.password) {
    return `"${uri}" must not contain credentials`;
  }

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
 * Validates a list of exact redirect URIs, returning the de-duplicated list.
 * Duplicates within one client are harmless, so they are collapsed silently
 * rather than reported.
 */
function validateUriList(
  value: unknown,
  label: string,
): { uris: string[]; errors: string[] } {
  if (!Array.isArray(value)) {
    return { uris: [], errors: [`${label} must be an array`] };
  }

  const errors = value
    .map(redirectUriError)
    .filter((error): error is string => error !== null);
  if (errors.length) return { uris: [], errors };

  return { uris: [...new Set(value as string[])], errors: [] };
}

/**
 * Turns the two configuration values into the client list the provider trusts.
 *
 * Invalid entries are dropped and reported rather than thrown: a typo in one
 * app's redirect URI must not take email/password and GitHub sign-in down for
 * everything else. Callers log `errors` and `warnings` so a dropped client is
 * still loud.
 *
 * The failure modes all point the same way. Unparseable `OAUTH_CLIENTS` means no
 * client is registered, so no authorization can complete; unparseable
 * `OAUTH_CLIENT_SECRETS` means no confidential client can be registered, for the
 * same reason. Neither ever falls back to a weaker check.
 *
 * Asynchronous only because a configured secret is hashed into its stored form
 * here (see ./lib/client-secret.ts) rather than being kept in memory as
 * plaintext for the lifetime of the isolate.
 */
export async function parseOAuthClients(
  clientsJson: string | undefined,
  secretsJson: string | undefined,
): Promise<ParsedClientRegistry> {
  const errors: string[] = [];
  const warnings: string[] = [];

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

  if (parsedClients === undefined) return { clients: [], errors, warnings };

  if (!Array.isArray(parsedClients)) {
    errors.push('OAUTH_CLIENTS must be a JSON array of client objects.');
    return { clients: [], errors, warnings };
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

  const clients: RegisteredClient[] = [];
  const seen = new Set<string>();
  // Two clients sharing a callback would mean one endpoint receiving codes
  // issued to two different identities — never intentional on a provider this
  // size, and it makes client-confusion mistakes possible downstream.
  const claimedRedirects = new Map<string, string>();

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

    const redirects = validateUriList(config.redirectURIs, 'redirectURIs');
    if (redirects.errors.length) {
      errors.push(`${where} (${clientId}): ${redirects.errors.join('; ')}.`);
      continue;
    }

    const postLogout = validateUriList(
      config.postLogoutRedirectURIs ?? [],
      'postLogoutRedirectURIs',
    );
    if (postLogout.errors.length) {
      errors.push(`${where} (${clientId}): ${postLogout.errors.join('; ')}.`);
      continue;
    }

    const stolen = redirects.uris.find(
      (uri) =>
        claimedRedirects.has(uri) && claimedRedirects.get(uri) !== clientId,
    );
    if (stolen) {
      errors.push(
        `${where} (${clientId}): redirect URI "${stolen}" is already registered to "${claimedRedirects.get(stolen)}".`,
      );
      continue;
    }

    const isPublic = PUBLIC_CLIENT_TYPES.has(type);
    const clientSecret = secrets[clientId];

    if (!isPublic && !clientSecret) {
      errors.push(
        `${where} (${clientId}): confidential clients need an OAUTH_CLIENT_SECRETS entry.`,
      );
      continue;
    }
    if (isPublic && clientSecret) {
      // A public client cannot keep a secret, so one configured for it is either
      // a copy-paste mistake or a misunderstanding of the client type. Either
      // way the secret is not protecting anything and should not look like it is.
      errors.push(
        `${where} (${clientId}): ${type} clients are public and must not have an OAUTH_CLIENT_SECRETS entry.`,
      );
      continue;
    }
    if (clientSecret && clientSecret.length < RECOMMENDED_SECRET_LENGTH) {
      warnings.push(
        `${where} (${clientId}): client secret is shorter than ${RECOMMENDED_SECRET_LENGTH} characters — generate a new one with \`openssl rand -base64 32\`.`,
      );
    }

    seen.add(clientId);
    for (const uri of redirects.uris) claimedRedirects.set(uri, clientId);

    clients.push({
      clientId,
      clientSecret: clientSecret
        ? await hashClientSecret(clientSecret)
        : undefined,
      name,
      type,
      public: isPublic,
      tokenEndpointAuthMethod: isPublic ? 'none' : 'client_secret_basic',
      redirectUris: redirects.uris,
      postLogoutRedirectUris: postLogout.uris,
      enableEndSession: config.enableEndSession === true,
      requirePKCE: true,
      // Every registered client here is one of my own applications, so there is
      // nothing for the user to consent to — the consent screen exists to
      // protect users from third-party apps, and none are allowed to register.
      skipConsent: true,
      disabled: false,
      // Authorization code only. `client_credentials` would let a client act
      // without a user, which no consumer of this provider needs; the plugin
      // still grants `refresh_token` alongside an authorization-code client.
      grantTypes: ['authorization_code'],
      responseTypes: ['code'],
    });
  }

  return { clients, errors, warnings };
}

/**
 * Origins the registered clients redirect back to. better-auth validates every
 * `callbackURL` against `trustedOrigins`, so registering a client also has to
 * make its origin trusted — otherwise the app that just completed a flow cannot
 * be used as a destination.
 */
export function clientOrigins(clients: RegisteredClient[]): string[] {
  const origins = new Set<string>();
  for (const client of clients) {
    for (const uri of [
      ...client.redirectUris,
      ...client.postLogoutRedirectUris,
    ]) {
      try {
        origins.add(new URL(uri).origin);
      } catch {
        // parseOAuthClients already rejected unparseable URIs.
      }
    }
  }
  return [...origins];
}
