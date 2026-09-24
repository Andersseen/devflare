/// <reference types="vitest" />

import { resolve } from 'node:path';
import analog from '@analogjs/platform';
import { defineConfig } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

// https://vitejs.dev/config/
export default defineConfig(() => {
  return {
    root: __dirname,
    cacheDir: `../../node_modules/.vite`,
    build: {
      outDir: '../../dist/apps/devflare/client',
      reportCompressedSize: true,
      target: ['es2020'],
    },
    server: {
      fs: {
        allow: ['.'],
      },
    },
    // The app shell's dependencies are only reached after the auth redirect, so
    // a cold dev server discovers them late and force-reloads the page mid-load.
    optimizeDeps: {
      include: ['@voltui/components', 'quartz-headless'],
    },
    plugins: [
      analog({
        nitro: {
          // Deploy target is a Cloudflare Worker with Static Assets.
          preset: 'cloudflare-module',
          // REQUIRED for local dev, not just cosmetic. Nitro picks a dev preset
          // by matching aliases *and* filtering on compatibilityDate; the
          // `cloudflare-dev` preset declares 2025-07-15, while Analog hardcodes
          // 2024-11-19. Left alone, cloudflare-dev is filtered out, the dev
          // plugin that injects bindings via wrangler's getPlatformProxy() never
          // loads, and every D1 query fails with "binding `DB` not found".
          // Analog merges these options over its own (mergeConfig), so this wins.
          compatibilityDate: '2026-05-23',
          alias: {
            // Nitro's server bundle does not go through nxViteTsPaths() — that
            // only resolves @org/* for the client/SSR builds — so the one
            // @org/* package a server route imports (the DevAuth OIDC/OAuth
            // client) needs an explicit alias here.
            '@dev-auth/core': resolve(
              __dirname,
              '../../libs/shared/dev-auth-core/src/index.ts',
            ),
          },
          // Deliberately NOT using `cloudflare.deployConfig`. That makes Nitro
          // emit a merged wrangler.json plus a .wrangler/deploy/config.json
          // redirect, and wrangler rejects redirected configs that declare
          // environments ("Redirected configurations cannot include
          // environments") — which we need for [env.production].
          //
          // Instead apps/devflare/wrangler.toml owns `main` and `[assets]`
          // directly. Node compat still switches on, because Nitro reads
          // `compatibility_flags = ["nodejs_compat"]` from that same file.
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
