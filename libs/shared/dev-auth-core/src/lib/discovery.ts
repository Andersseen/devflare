import { DiscoveryError } from './errors';

/**
 * The subset of RFC 8414 / OpenID Connect Discovery metadata this SDK reads.
 * Providers publish more fields than this; anything else is ignored.
 */
export interface ProviderMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  end_session_endpoint?: string;
  revocation_endpoint?: string;
  jwks_uri?: string;
}

export interface DiscoverOptions {
  /** How long a fetched document is trusted before it is fetched again. */
  ttlMs?: number;
  /** Override for tests; defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

interface CacheEntry {
  metadata: ProviderMetadata;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 10 * 60 * 1000;
/** How long a fallback (discovery-unavailable) result is trusted before the
 * next call retries the network instead of assuming the outage continues. */
const FALLBACK_TTL_MS = 30 * 1000;

/**
 * One cache shared by every client built from this module, keyed by issuer —
 * several `createDevAuthClient` calls against the same provider, across many
 * requests in one Worker isolate, should not each pay for their own discovery
 * fetch.
 */
const cache = new Map<string, CacheEntry>();

/**
 * dev-auth's own endpoint layout, mounted by `@better-auth/oauth-provider`
 * under `{issuer}/api/auth/oauth2/*`. Used when discovery cannot be reached —
 * resolving it without a network call is what keeps a temporarily unavailable
 * provider from making every authorization attempt pay for a doomed fetch
 * first. A provider with a different layout is expected to answer discovery
 * correctly instead of relying on this fallback.
 */
function conventionalMetadata(issuer: string): ProviderMetadata {
  const base = `${issuer}/api/auth`;
  return {
    issuer,
    authorization_endpoint: `${base}/oauth2/authorize`,
    token_endpoint: `${base}/oauth2/token`,
    userinfo_endpoint: `${base}/oauth2/userinfo`,
    end_session_endpoint: `${base}/oauth2/end-session`,
    revocation_endpoint: `${base}/oauth2/revoke`,
    jwks_uri: `${issuer}/api/auth/jwks`,
  };
}

/**
 * Fetches `{issuer}/.well-known/openid-configuration`, cached for `ttlMs`
 * (default 10 minutes).
 *
 * An issuer mismatch always throws — that is a spoofing signal, not an
 * outage, and must never fall back to a guessed endpoint set for the wrong
 * provider. An unreachable or non-200 discovery endpoint instead falls back to
 * {@link conventionalMetadata}, cached briefly, so an outage degrades to "use
 * the known layout" rather than failing every sign-in.
 */
export async function discoverMetadata(
  issuer: string,
  options: DiscoverOptions = {},
): Promise<ProviderMetadata> {
  const cached = cache.get(issuer);
  if (cached && cached.expiresAt > Date.now()) return cached.metadata;

  const doFetch = options.fetch ?? fetch;
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;

  const fail = (metadata: ProviderMetadata, ttl: number) => {
    cache.set(issuer, { metadata, expiresAt: Date.now() + ttl });
    return metadata;
  };

  let response: Response;
  try {
    response = await doFetch(`${issuer}/.well-known/openid-configuration`);
  } catch {
    return fail(conventionalMetadata(issuer), FALLBACK_TTL_MS);
  }

  if (!response.ok) {
    return fail(conventionalMetadata(issuer), FALLBACK_TTL_MS);
  }

  const metadata = (await response
    .json()
    .catch(() => null)) as ProviderMetadata | null;

  if (!metadata || typeof metadata.issuer !== 'string') {
    return fail(conventionalMetadata(issuer), FALLBACK_TTL_MS);
  }

  if (metadata.issuer !== issuer) {
    throw new DiscoveryError(
      `discovery document issuer "${metadata.issuer}" does not match configured issuer "${issuer}"`,
    );
  }

  return fail(metadata, ttlMs);
}

/** Exposed for tests; a long-running process has no other reason to evict a
 * still-valid entry before its TTL. */
export function clearDiscoveryCache(issuer?: string): void {
  if (issuer) cache.delete(issuer);
  else cache.clear();
}
