import { computed, inject, type Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';

/**
 * Single source of truth for the app shell's navigation.
 *
 * The top navbar exposes the two top-level sections; the sidebar only renders
 * the groups of the section you are currently in. Keeping both driven by this
 * file is what stops the sidebar from growing back into one flat 14-item list.
 */

/** Keep in sync with the `version` field in the root package.json. */
export const APP_VERSION = '0.1.0';

export interface Tool {
  title: string;
  description: string;
  link: string;
  icon: string;
  colorClass: string;
  bgClass: string;
  /** Shorter label used in the sidebar; falls back to `title`. */
  navLabel?: string;
}

export const TOOLS: Tool[] = [
  {
    title: 'Image Compressor',
    navLabel: 'Image Compressor',
    description: 'Optimize PNG, JPEG, and WEBP images locally with WebWorkers.',
    link: '/tools/image-compressor',
    icon: 'image',
    colorClass: 'text-blue-500',
    bgClass: 'bg-blue-500/10',
  },
  {
    title: 'QR Code Studio',
    navLabel: 'QR Generator',
    description:
      'Generate customizable QR codes for URLs, text, and Wi-Fi networks.',
    link: '/tools/qr-generator',
    icon: 'qr-code',
    colorClass: 'text-pink-500',
    bgClass: 'bg-pink-500/10',
  },
  {
    title: 'SVG Optimizer',
    description: 'Minify and clean up SVG code directly in your browser.',
    link: '/tools/svg-optimizer',
    icon: 'scissors',
    colorClass: 'text-orange-500',
    bgClass: 'bg-orange-500/10',
  },
  {
    title: 'SEO Simulator',
    description:
      'Preview how your pages appear on Google, Twitter, and Facebook.',
    link: '/tools/seo-simulator',
    icon: 'search',
    colorClass: 'text-sky-500',
    bgClass: 'bg-sky-500/10',
  },
  {
    title: 'Data Converter',
    description: 'Convert between JSON and CSV formats instantly.',
    link: '/tools/converter',
    icon: 'arrow-right-left',
    colorClass: 'text-cyan-500',
    bgClass: 'bg-cyan-500/10',
  },
  {
    title: 'Screen Recorder',
    description:
      'Record your screen directly from the browser without plugins.',
    link: '/tools/recorder',
    icon: 'video',
    colorClass: 'text-red-500',
    bgClass: 'bg-red-500/10',
  },
  {
    title: 'Social Card Designer',
    description:
      'Create beautiful Open Graph images for your social media posts.',
    link: '/tools/og-generator',
    icon: 'globe',
    colorClass: 'text-purple-500',
    bgClass: 'bg-purple-500/10',
  },
  {
    title: 'Cinematic Palette',
    description: 'Extract dominant colors and create cinematic compositions.',
    link: '/tools/palette',
    icon: 'brush',
    colorClass: 'text-fuchsia-500',
    bgClass: 'bg-fuchsia-500/10',
  },
  {
    title: 'Background Remover',
    description: 'Remove image backgrounds using AI completely client-side.',
    link: '/tools/bg-remover',
    icon: 'paint-bucket',
    colorClass: 'text-emerald-600',
    bgClass: 'bg-emerald-600/10',
  },
  {
    title: 'URL Shortener',
    description:
      'Shorten long links and keep track of them with custom aliases.',
    link: '/tools/shortener',
    icon: 'link',
    colorClass: 'text-indigo-500',
    bgClass: 'bg-indigo-500/10',
  },
];

export const PLATFORM_CARDS: Tool[] = [
  {
    title: 'Deploy',
    description:
      'Upload a built folder to one of your Cloudflare Pages projects.',
    link: '/deploy',
    icon: 'zap',
    colorClass: 'text-green-500',
    bgClass: 'bg-green-500/10',
  },
  {
    title: 'Projects',
    description: 'Manage your deployed projects and view deployment history.',
    link: '/projects',
    icon: 'folder-open',
    colorClass: 'text-primary',
    bgClass: 'bg-primary/10',
  },
  {
    title: 'Cloud',
    description:
      'See the Workers, Pages and storage on your Cloudflare account.',
    link: '/cloud',
    icon: 'cloud',
    colorClass: 'text-orange-500',
    bgClass: 'bg-orange-500/10',
  },
];

export interface ShellNavItem {
  label: string;
  link: string;
  icon: string;
  exact?: boolean;
}

export interface ShellNavGroup {
  label: string;
  items: ShellNavItem[];
}

export interface ShellSection {
  id: string;
  label: string;
  /** Where the top-nav tab navigates to. */
  link: string;
  /** URL prefixes that activate this section; longest match wins. */
  matches: string[];
  groups: ShellNavGroup[];
}

export const SHELL_SECTIONS: ShellSection[] = [
  {
    id: 'deployment',
    label: 'Deployment',
    link: '/',
    matches: ['/', '/deploy', '/projects', '/cloud', '/settings'],
    groups: [
      {
        label: 'Platform',
        items: [
          {
            label: 'Dashboard',
            link: '/',
            icon: 'layout-dashboard',
            exact: true,
          },
          { label: 'Deploy', link: '/deploy', icon: 'zap' },
          { label: 'Projects', link: '/projects', icon: 'folder-open' },
        ],
      },
      {
        label: 'Cloudflare',
        items: [
          { label: 'Cloud', link: '/cloud', icon: 'cloud', exact: true },
          { label: 'Buckets', link: '/cloud/buckets', icon: 'hard-drive' },
          { label: 'Storage', link: '/cloud/storage', icon: 'database' },
        ],
      },
    ],
  },
  {
    id: 'devtools',
    label: 'DevTools',
    link: '/tools',
    matches: ['/tools'],
    groups: [
      {
        label: 'Tools',
        items: TOOLS.map((tool) => ({
          label: tool.navLabel ?? tool.title,
          link: tool.link,
          icon: tool.icon,
        })),
      },
    ],
  },
];

/** Item pinned to the sidebar footer, shown in every section. */
export const SETTINGS_ITEM: ShellNavItem = {
  label: 'Settings',
  link: '/settings',
  icon: 'settings',
};

/**
 * Signal of the section owning the current URL. Shared by the navbar (to
 * highlight the active tab) and the sidebar (to pick which groups to render).
 */
export function injectActiveSection(): Signal<ShellSection> {
  const router = inject(Router);
  const url = toSignal(
    router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: router.url },
  );

  return computed(() => sectionForUrl(url()));
}

/** Resolves which section owns a URL. Falls back to the first section. */
export function sectionForUrl(url: string): ShellSection {
  const path = url.split(/[?#]/)[0];
  let best = SHELL_SECTIONS[0];
  let bestLength = -1;

  for (const section of SHELL_SECTIONS) {
    for (const prefix of section.matches) {
      const matches =
        prefix === '/'
          ? path === '/'
          : path === prefix || path.startsWith(`${prefix}/`);

      if (matches && prefix.length > bestLength) {
        best = section;
        bestLength = prefix.length;
      }
    }
  }

  return best;
}
