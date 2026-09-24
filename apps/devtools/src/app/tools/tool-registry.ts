/**
 * Every DevTools utility, in one place.
 *
 * This one list drives the home grid, the header navigation and — through
 * vite.config.ts — the set of routes prerendered at build time. So a tool that
 * is listed here but has no page fails the build, and a tool page that is not
 * listed here is unreachable; `tool-registry.spec.ts` checks both directions.
 *
 * Plain data on purpose: no Angular imports, so the Vite config — and the
 * Worker, which reserves every tool path as a short-link slug — can read it.
 *
 * `category` is what a tool is about; `mode` is how it runs (spec 020):
 *   local      — entirely in the browser, anonymous, input never leaves the tab
 *   connected  — needs DevTools' server: DevAuth sign-in + DevTools authorization
 */

export type ToolCategoryId = 'web' | 'security' | 'cloud' | 'data' | 'media';
export type ToolMode = 'local' | 'connected';

export interface ToolCategory {
  id: ToolCategoryId;
  label: string;
  description: string;
}

export interface Tool {
  /** Route path, relative to the app root — also the page file name. */
  path: string;
  title: string;
  /** Shorter label for navigation; falls back to `title`. */
  navLabel?: string;
  description: string;
  category: ToolCategoryId;
  mode: ToolMode;
  icon: string;
  colorClass: string;
  bgClass: string;
}

export const TOOL_CATEGORIES: ToolCategory[] = [
  {
    id: 'web',
    label: 'Web',
    description: 'Links, requests, previews and domains for what you ship.',
  },
  {
    id: 'security',
    label: 'Security',
    description:
      'Tokens, OAuth flows and response headers — decoded, not uploaded.',
  },
  {
    id: 'cloud',
    label: 'Cloud',
    description:
      'Cloudflare Workers configuration, checked against Wrangler’s own rules.',
  },
  {
    id: 'data',
    label: 'Data',
    description: 'Reshape structured data without pasting it into a server.',
  },
  {
    id: 'media',
    label: 'Media',
    description: 'Images, colour and video — processed in the tab.',
  },
];

export const TOOLS: Tool[] = [
  {
    path: 'seo-simulator',
    title: 'SEO Simulator',
    description:
      'Preview how your pages appear on Google, Twitter and Facebook.',
    category: 'web',
    mode: 'local',
    icon: 'search',
    colorClass: 'text-sky-500',
    bgClass: 'bg-sky-500/10',
  },
  {
    path: 'qr-generator',
    title: 'QR Code Studio',
    navLabel: 'QR Codes',
    description:
      'Generate customizable QR codes for URLs, text and Wi-Fi networks.',
    category: 'web',
    mode: 'local',
    icon: 'qr-code',
    colorClass: 'text-pink-500',
    bgClass: 'bg-pink-500/10',
  },
  {
    path: 'curl-converter',
    title: 'cURL ↔ Fetch',
    description:
      'Convert curl commands to fetch() and back, with warnings for what does not translate.',
    category: 'web',
    mode: 'local',
    icon: 'terminal',
    colorClass: 'text-slate-600 dark:text-slate-300',
    bgClass: 'bg-slate-500/10',
  },
  {
    path: 'short-links',
    title: 'Short Links',
    description:
      'Personal short links that really redirect — create, edit and disable them.',
    category: 'web',
    mode: 'connected',
    icon: 'link',
    colorClass: 'text-indigo-500',
    bgClass: 'bg-indigo-500/10',
  },
  {
    path: 'domain-inspector',
    title: 'Domain Inspector',
    description:
      'DNS records, the redirect chain and response headers of a domain.',
    category: 'web',
    mode: 'connected',
    icon: 'radar',
    colorClass: 'text-orange-500',
    bgClass: 'bg-orange-500/10',
  },
  {
    path: 'oauth-inspector',
    title: 'OAuth / OIDC Inspector',
    navLabel: 'OAuth Inspector',
    description:
      'Check an authorization URL, decode a JWT and work out PKCE — all in the tab.',
    category: 'security',
    mode: 'local',
    icon: 'key-round',
    colorClass: 'text-amber-500',
    bgClass: 'bg-amber-500/10',
  },
  {
    path: 'security-headers',
    title: 'Security Headers',
    description:
      'Paste response headers; see what each one does, what is weak and what is missing.',
    category: 'security',
    mode: 'local',
    icon: 'shield-check',
    colorClass: 'text-green-600',
    bgClass: 'bg-green-600/10',
  },
  {
    path: 'wrangler-doctor',
    title: 'Wrangler Config Doctor',
    navLabel: 'Wrangler Doctor',
    description:
      'Check wrangler.toml / wrangler.jsonc for binding drift, duplicates and missing fields.',
    category: 'cloud',
    mode: 'local',
    icon: 'stethoscope',
    colorClass: 'text-orange-600',
    bgClass: 'bg-orange-600/10',
  },
  {
    path: 'data-converter',
    title: 'Data Converter',
    description: 'Convert between JSON and CSV formats instantly.',
    category: 'data',
    mode: 'local',
    icon: 'arrow-right-left',
    colorClass: 'text-cyan-500',
    bgClass: 'bg-cyan-500/10',
  },
  {
    path: 'screen-recorder',
    title: 'Screen Recorder',
    description: 'Record your screen directly from the browser, no plugins.',
    category: 'media',
    mode: 'local',
    icon: 'video',
    colorClass: 'text-red-500',
    bgClass: 'bg-red-500/10',
  },
  {
    path: 'og-generator',
    title: 'Social Card Designer',
    navLabel: 'Social Cards',
    description: 'Create Open Graph images for your social media posts.',
    category: 'media',
    mode: 'local',
    icon: 'globe',
    colorClass: 'text-purple-500',
    bgClass: 'bg-purple-500/10',
  },
  {
    path: 'palette',
    title: 'Cinematic Palette',
    navLabel: 'Palette',
    description: 'Extract dominant colours and create cinematic compositions.',
    category: 'media',
    mode: 'local',
    icon: 'brush',
    colorClass: 'text-fuchsia-500',
    bgClass: 'bg-fuchsia-500/10',
  },
  {
    path: 'bg-remover',
    title: 'Background Remover',
    description: 'Remove image backgrounds with an in-browser AI model.',
    category: 'media',
    mode: 'local',
    icon: 'paint-bucket',
    colorClass: 'text-emerald-600',
    bgClass: 'bg-emerald-600/10',
  },
];

export function toolsIn(category: ToolCategoryId, mode?: ToolMode): Tool[] {
  return TOOLS.filter(
    (tool) => tool.category === category && (!mode || tool.mode === mode),
  );
}

export function toolsWithMode(mode: ToolMode): Tool[] {
  return TOOLS.filter((tool) => tool.mode === mode);
}

/** Resolves the tool owning a URL path such as `/palette?x=1`. */
export function toolForUrl(url: string): Tool | null {
  const path = url.split(/[?#]/)[0].replace(/^\/+|\/+$/g, '');
  return TOOLS.find((tool) => tool.path === path) ?? null;
}
