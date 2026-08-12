/**
 * Redirect-URI validation, shared by every path that can register one.
 *
 * This used to live in ../oauth-clients.ts and therefore only ever ran against
 * `OAUTH_CLIENTS`. Clients can now also arrive from D1 (see ../client-registry.ts),
 * and a runtime-registered client must not be able to register something the
 * configuration path would have rejected — so the rules live here, in one place,
 * and both callers use them.
 *
 * A redirect URI is the one value in the whole flow that decides where an
 * authorization code is delivered. It is compared byte for byte at authorization
 * time; nothing here normalises, because normalising would mean accepting a URI
 * that then fails to match.
 */

/**
 * Returns why `uri` is unusable as a redirect target, or null if it is fine.
 * Plain http is only tolerated for loopback development hosts.
 */
export function redirectUriError(uri: unknown): string | null {
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

/**
 * Validates a list of exact redirect URIs, returning the de-duplicated list.
 * Duplicates within one client are harmless, so they are collapsed silently
 * rather than reported.
 */
export function validateUriList(
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
