/// <reference types="vitest" />

import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import analog from '@analogjs/platform';
import { defineConfig } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

/**
 * Nitro aliases are prefix-matched, so an alias target that starts with its own
 * key rewrites itself recursively ("colorthief/x" -> "colorthief/x/x"). Every
 * target below must therefore be an absolute path.
 */
const req = createRequire(resolve(__dirname, 'vite.config.ts'));

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
          // The tool services in @org/core are browser-only (AGENTS.md), but
          // SSR still pulls their dependencies into the Worker bundle, where
          // Node-native code cannot go. Point each at a browser build, or stub
          // it when no usable build exists.
          alias: {
            // Node build reaches sharp via ndarray-pixels. The ESM build is the
            // real browser implementation and has no such import.
            colorthief: req.resolve('colorthief/dist/color-thief.mjs'),
            // No usable build: papaparse is CJS-only and stringifies a module
            // factory into a Blob worker, which desyncs Rollup's CommonJS
            // transform. See shims/papaparse.server.mjs.
            papaparse: resolve(__dirname, 'shims/papaparse.server.mjs'),
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
