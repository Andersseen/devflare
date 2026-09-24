/// <reference types="vitest" />

import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import analog from '@analogjs/platform';
import { defineConfig } from 'vite';
import type { PrerenderRoute } from 'nitropack';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { TOOLS } from './src/app/tools/tool-registry';

/**
 * Nitro aliases are prefix-matched, so an alias target that starts with its own
 * key rewrites itself recursively ("colorthief/x" -> "colorthief/x/x"). Every
 * target below must therefore be an absolute path.
 */
const req = createRequire(resolve(__dirname, 'vite.config.ts'));

/**
 * A page that throws during render (say, a tool touching `window` in a
 * constructor) does not fail the render: Angular's ErrorHandler logs it and
 * the route still comes back 200 with the page body missing. Every DevTools
 * page has an `<h1>`, so a prerendered route without one is marked as failed
 * here — Nitro runs this hook before it checks `route.error`.
 */
function failRouteWithoutHeading(route: PrerenderRoute): void {
  if (route.error || !route.route.match(/^\/[^.]*$/)) return;
  if (typeof route.contents === 'string' && /<h1[\s>]/.test(route.contents)) {
    return;
  }

  route.error = Object.assign(
    new Error(`Prerendered ${route.route} has no <h1>; did the page throw?`),
    { statusCode: 500 },
  );
}

/**
 * DevTools ships as static files only: every route is prerendered at build time
 * and there is no server bundle, no API and no binding. That is what keeps it
 * free to host — and prerendering doubles as the SSR safety net, because a tool
 * that touches `window`/`document` during render fails this build.
 */
export default defineConfig(() => {
  return {
    root: __dirname,
    // Its own optimizer cache: sharing DevFlare's `node_modules/.vite` makes
    // the two dev servers re-optimize and force-reload each other.
    cacheDir: `../../node_modules/.vite/devtools`,
    build: {
      outDir: '../../dist/apps/devtools/client',
      reportCompressedSize: true,
      target: ['es2020'],
    },
    server: {
      fs: {
        allow: ['.'],
      },
    },
    // Each tool page pulls in its own heavy dependency. Left to discovery,
    // Vite finds them one page at a time on a cold dev server and force-reloads
    // the browser each time — which breaks whatever was loading (E2E included).
    optimizeDeps: {
      include: [
        '@angular/forms',
        '@voltui/components',
        '@imgly/background-removal',
        'colorthief',
        'html-to-image',
        'papaparse',
        'qrcode',
      ],
    },
    resolve: {
      alias: {
        // colorthief's `main` is a Node build that reaches sharp through
        // ndarray-pixels and cannot be constructed by the prerenderer or by
        // jsdom ("ColorThief is not a constructor"). Its ESM build is the real
        // browser implementation, so every environment — client, prerender,
        // unit tests — uses that one.
        colorthief: req.resolve('colorthief/dist/color-thief.mjs'),
      },
    },
    plugins: [
      analog({
        static: true,
        prerender: {
          routes: ['/', ...TOOLS.map((tool) => `/${tool.path}`)],
          postRenderingHooks: [failRouteWithoutHeading],
        },
        nitro: {
          // Turns a route marked by failRouteWithoutHeading into a failed
          // build rather than a logged warning.
          prerender: {
            failOnError: true,
          },
          alias: {
            // The tool services are browser-only, but the prerender bundle still
            // pulls in their dependencies. papaparse has no usable build there:
            // it is CJS-only and stringifies a module factory into a Blob
            // worker, which desyncs Rollup's CommonJS transform. See
            // shims/papaparse.server.mjs.
            papaparse: resolve(__dirname, 'shims/papaparse.server.mjs'),
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
