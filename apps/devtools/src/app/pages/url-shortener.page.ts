import type { RouteMeta } from '@analogjs/router';

/**
 * The draft-only URL Shortener became Short Links (spec 020) — links that
 * really redirect. Old bookmarks, and DevFlare's legacy /tools/shortener
 * redirect, land here and move on.
 */
export const routeMeta: RouteMeta = {
  redirectTo: '/short-links',
  pathMatch: 'full',
};
