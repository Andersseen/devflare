/// <reference types="vitest" />

import { resolve } from 'node:path';
import analog from '@analogjs/platform';
import { defineConfig } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

/** Static routes prerendered into Static Assets. `/repositories/:id` cannot be
 * prerendered (the id is data) and is server-rendered by the Worker. */
const PRERENDER_ROUTES = [
  '/',
  '/repositories',
  '/pull-requests',
  '/activity',
  '/settings',
];

/**
 * DevRadar is a Cloudflare Worker with Static Assets (spec 021), the same
 * deploy shape as DevTools. Prerendering doubles as the SSR safety net: a page
 * that touches `window`/`document` during render fails this build.
 */
export default defineConfig(() => {
  return {
    root: __dirname,
    // Its own optimizer cache so the dev servers don't force-reload each other.
    cacheDir: `../../node_modules/.vite/dev-radar`,
    build: {
      outDir: '../../dist/apps/dev-radar/client',
      reportCompressedSize: true,
      target: ['es2020'],
    },
    server: {
      fs: {
        allow: ['.'],
      },
    },
    optimizeDeps: {
      include: ['@angular/forms', '@voltui/components'],
    },
    plugins: [
      analog({
        prerender: {
          routes: PRERENDER_ROUTES,
        },
        nitro: {
          preset: 'cloudflare-module',
          // REQUIRED for local dev — without it Nitro filters out the
          // `cloudflare-dev` preset, the wrangler getPlatformProxy() plugin
          // never loads and every D1 query fails with "binding `DB` not
          // found". Same reasoning as apps/devflare/vite.config.ts.
          compatibilityDate: '2026-05-23',
          prerender: {
            failOnError: true,
          },
          // Cron reconcile (wrangler [triggers] crons): Nitro maps the
          // schedule to the task in src/server/tasks/radar/reconcile.ts and
          // emits the Worker's `scheduled` handler for it. The schedule here
          // must match wrangler.toml.
          experimental: { tasks: true },
          scheduledTasks: { '17 */6 * * *': ['radar:reconcile'] },
          alias: {
            // Nitro's server bundle does not go through nxViteTsPaths(), so
            // the one SDK package the server imports needs an explicit alias.
            '@dev-auth/core': resolve(
              __dirname,
              '../../libs/shared/dev-auth-core/src/index.ts',
            ),
            // Pure layout logic shared with DevFlare (no Angular in it).
            '@org/dashboard-layout/logic': resolve(
              __dirname,
              '../../libs/shared/dashboard-layout/src/logic.ts',
            ),
          },
        },
      }),
      nxViteTsPaths(),
    ],
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['src/test-setup.ts'],
      include: ['**/*.spec.ts'],
      reporters: ['default'],
    },
  };
});
