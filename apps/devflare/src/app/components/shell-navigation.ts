import { computed, inject, type Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';

/**
 * Single source of truth for the app shell's navigation.
 *
 * DevFlare is a personal project hub: Projects is the product, Cloud is the
 * raw infrastructure behind it, and Settings (profile, integrations, identity
 * administration) is pinned to the sidebar footer rather than competing with
 * either. The top navbar exposes the sections; the sidebar renders only the
 * groups of the section you are in.
 *
 * Browser utilities are not here on purpose — they are the separate DevTools
 * app (apps/devtools), reached through the single DEVTOOLS_LINK below.
 */

/** Keep in sync with the `version` field in the root package.json. */
export const APP_VERSION = '0.1.0';

/**
 * Where the standalone DevTools app lives, for the one product-level link
 * DevFlare shows. Build-time (`VITE_DEVTOOLS_URL`) because the link is in the
 * client bundle; in development it defaults to the local `pnpm dev:tools`
 * port. With no value in a production build the link is simply not rendered —
 * no DevTools domain is assumed. The server-side `/tools/*` redirects read the
 * runtime `DEVTOOLS_URL` var instead (see server/lib/legacy-tools.ts).
 */
export const DEVTOOLS_LINK: string | null =
  (import.meta.env['VITE_DEVTOOLS_URL'] as string | undefined) ||
  (import.meta.env.DEV ? 'http://localhost:4300' : null);

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
    id: 'projects',
    label: 'Projects',
    link: '/',
    matches: ['/', '/projects', '/deploy', '/settings'],
    groups: [
      {
        label: 'Hub',
        items: [
          {
            label: 'Projects',
            link: '/',
            icon: 'folder-open',
            exact: true,
          },
        ],
      },
    ],
  },
  {
    id: 'cloud',
    label: 'Cloud',
    link: '/cloud',
    matches: ['/cloud'],
    groups: [
      {
        label: 'Cloudflare',
        items: [
          { label: 'Overview', link: '/cloud', icon: 'cloud', exact: true },
          { label: 'Buckets', link: '/cloud/buckets', icon: 'hard-drive' },
          { label: 'Storage', link: '/cloud/storage', icon: 'database' },
        ],
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
