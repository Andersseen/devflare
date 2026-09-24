import { TOOLS } from '../../../app/tools/tool-registry';

/**
 * What a short link may be called and where it may point. Enforced on the
 * server for every create and update; the page only mirrors it for feedback.
 */

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
export const MAX_DESTINATION_LENGTH = 2048;

/**
 * Slugs that would collide with something the DevTools Worker already serves
 * on the same host: every tool page (from the registry, so a new tool is
 * reserved automatically), the API, and conventional system paths.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  ...TOOLS.map((tool) => tool.path),
  'api',
  'go',
  'auth',
  'login',
  'logout',
  'callback',
  'admin',
  'assets',
  'static',
  'public',
  'index',
  'home',
  'favicon',
  'robots',
  'sitemap',
  'health',
  'well-known',
  '_analog',
  'devtools',
]);

export type SlugProblem = 'invalid_slug' | 'reserved_slug';

export function normalizeSlug(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

export function checkSlug(slug: string): SlugProblem | null {
  if (!SLUG_PATTERN.test(slug)) return 'invalid_slug';
  if (RESERVED_SLUGS.has(slug)) return 'reserved_slug';
  return null;
}

export interface ShortLinkBase {
  /** `host[:port]`, compared with the request's Host. */
  host: string;
  /** '' or a prefix such as `/api/go`, without a trailing slash. */
  pathPrefix: string;
  /** Normalized base URL, for building public links. */
  url: string;
}

export function parseShortLinkBase(
  raw: string | undefined,
): ShortLinkBase | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const pathPrefix = url.pathname.replace(/\/+$/, '');
    return { host: url.host, pathPrefix, url: `${url.origin}${pathPrefix}` };
  } catch {
    return null;
  }
}

export function publicUrl(base: ShortLinkBase, slug: string): string {
  return `${base.url}/${slug}`;
}

/**
 * Destinations are absolute http(s) URLs. Other schemes (`javascript:`,
 * `data:`, `file:`, …) are refused: a redirect to them is at best useless and
 * at worst script execution on click. Credentials in the URL are refused, and
 * so is a destination on the short-link base itself, which would loop.
 */
export function checkDestination(
  raw: unknown,
  base: ShortLinkBase | null,
): { ok: true; url: string } | { ok: false; reason: string } {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { ok: false, reason: 'A destination URL is required.' };
  }
  const value = raw.trim();
  if (value.length > MAX_DESTINATION_LENGTH) {
    return {
      ok: false,
      reason: `Destinations are limited to ${MAX_DESTINATION_LENGTH} characters.`,
    };
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return {
      ok: false,
      reason: 'The destination must be an absolute URL (https://…).',
    };
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return {
      ok: false,
      reason: 'Only http:// and https:// destinations are allowed.',
    };
  }
  if (!url.hostname) {
    return { ok: false, reason: 'The destination has no host.' };
  }
  if (url.username || url.password) {
    return { ok: false, reason: 'Destinations may not contain credentials.' };
  }
  if (
    base &&
    url.host === base.host &&
    (base.pathPrefix === '' || url.pathname.startsWith(`${base.pathPrefix}/`))
  ) {
    return {
      ok: false,
      reason: 'A short link cannot point at another short link.',
    };
  }

  return { ok: true, url: url.toString() };
}

export type ShortLinkMatch =
  | { kind: 'slug'; slug: string }
  | { kind: 'invalid' };

/**
 * Does this request belong to the short-link redirect?
 *
 * - `null`: not ours — continue to the rest of the app (assets, API, pages).
 * - `slug`: look it up and redirect.
 * - `invalid`: under an explicit prefix but not a valid slug — answer 404
 *   rather than falling through to the app.
 *
 * With no prefix (a dedicated host such as go.andersseen.dev), only a single
 * path segment that is a valid, non-reserved slug is claimed; everything else
 * falls through, so `/api/*` and assets keep working on that host.
 */
export function matchShortLinkRequest(
  url: URL,
  base: ShortLinkBase,
): ShortLinkMatch | null {
  if (url.host !== base.host) return null;

  let rest: string;
  if (base.pathPrefix) {
    if (!url.pathname.startsWith(`${base.pathPrefix}/`)) return null;
    rest = url.pathname.slice(base.pathPrefix.length + 1);
  } else {
    rest = url.pathname.slice(1);
  }
  rest = rest.replace(/\/$/, '');

  let slug: string;
  try {
    slug = decodeURIComponent(rest).toLowerCase();
  } catch {
    return base.pathPrefix ? { kind: 'invalid' } : null;
  }

  if (checkSlug(slug) !== null)
    return base.pathPrefix ? { kind: 'invalid' } : null;
  return { kind: 'slug', slug };
}
