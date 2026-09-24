/**
 * Every DevTools utility, in one place.
 *
 * This one list drives the home grid, the header navigation and — through
 * vite.config.ts — the set of routes prerendered at build time. So a tool that
 * is listed here but has no page fails the build, and a tool page that is not
 * listed here is unreachable; `tool-registry.spec.ts` checks both directions.
 *
 * Plain data on purpose: no Angular imports, so the Vite config can read it.
 */

export type ToolCategoryId = 'web' | 'data' | 'media';

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
  icon: string;
  colorClass: string;
  bgClass: string;
}

export const TOOL_CATEGORIES: ToolCategory[] = [
  {
    id: 'web',
    label: 'Web',
    description: 'Links, previews and metadata for the pages you ship.',
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
    icon: 'qr-code',
    colorClass: 'text-pink-500',
    bgClass: 'bg-pink-500/10',
  },
  {
    path: 'url-shortener',
    title: 'URL Shortener',
    description: 'Draft short aliases for long links, with a QR code each.',
    category: 'web',
    icon: 'link',
    colorClass: 'text-indigo-500',
    bgClass: 'bg-indigo-500/10',
  },
  {
    path: 'data-converter',
    title: 'Data Converter',
    description: 'Convert between JSON and CSV formats instantly.',
    category: 'data',
    icon: 'arrow-right-left',
    colorClass: 'text-cyan-500',
    bgClass: 'bg-cyan-500/10',
  },
  {
    path: 'screen-recorder',
    title: 'Screen Recorder',
    description: 'Record your screen directly from the browser, no plugins.',
    category: 'media',
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
    icon: 'brush',
    colorClass: 'text-fuchsia-500',
    bgClass: 'bg-fuchsia-500/10',
  },
  {
    path: 'bg-remover',
    title: 'Background Remover',
    description: 'Remove image backgrounds with an in-browser AI model.',
    category: 'media',
    icon: 'paint-bucket',
    colorClass: 'text-emerald-600',
    bgClass: 'bg-emerald-600/10',
  },
];

export function toolsIn(category: ToolCategoryId): Tool[] {
  return TOOLS.filter((tool) => tool.category === category);
}

/** Resolves the tool owning a URL path such as `/palette?x=1`. */
export function toolForUrl(url: string): Tool | null {
  const path = url.split(/[?#]/)[0].replace(/^\/+|\/+$/g, '');
  return TOOLS.find((tool) => tool.path === path) ?? null;
}
