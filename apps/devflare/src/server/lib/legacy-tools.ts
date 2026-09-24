/**
 * DevFlare used to host the browser utilities under /tools/*. They are a
 * separate app now (apps/devtools), with its own clean URLs, so the old paths
 * are forwarded there — but only once a deployment says where DevTools lives.
 * No production DevTools domain is assumed here: with `DEVTOOLS_URL` unset,
 * old links land on DevFlare's home, which is what they did for any unknown
 * route before.
 *
 * Plain code with no h3 import, like ./oidc.ts, so it is unit-testable.
 */

export interface RequestContext {
  cloudflare?: { env?: Record<string, string | undefined> };
}

/**
 * Old DevFlare slug → DevTools path. Includes the three aliases DevFlare's own
 * navigation linked to but never had pages for (converter, recorder,
 * shortener), so anyone holding one of those links finally reaches the tool.
 */
const LEGACY_TOOL_PATHS: Record<string, string> = {
  'qr-generator': 'qr-generator',
  'seo-simulator': 'seo-simulator',
  'data-converter': 'data-converter',
  converter: 'data-converter',
  'screen-recorder': 'screen-recorder',
  recorder: 'screen-recorder',
  'og-generator': 'og-generator',
  palette: 'palette',
  'bg-remover': 'bg-remover',
  'url-shortener': 'url-shortener',
  shortener: 'url-shortener',
};

/** The configured DevTools origin, or null when this deployment has none. */
export function devtoolsUrl(context: RequestContext): string | null {
  const value =
    context.cloudflare?.env?.['DEVTOOLS_URL'] ?? process.env['DEVTOOLS_URL'];
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

/**
 * Where a legacy `/tools/<slug>` request should go. An unknown slug (including
 * the image tools that moved to Imageryx) lands on the DevTools home rather
 * than guessing.
 */
export function legacyToolRedirect(
  pathname: string,
  devtools: string | null,
): string {
  if (!devtools) return '/';

  const slug = pathname
    .split(/[?#]/)[0]
    .replace(/^\/tools\/?/, '')
    .replace(/\/+$/, '');
  const target = LEGACY_TOOL_PATHS[slug];

  return target ? `${devtools}/${target}` : `${devtools}/`;
}
