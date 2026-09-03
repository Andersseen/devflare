import { defineConfig } from 'vite';

/**
 * Vitest for @org/dev-auth-core.
 *
 * `node`, not `jsdom`: this library is deliberately Angular- and h3-free
 * protocol code (fetch, Web Crypto, URL/URLSearchParams), so its tests run
 * under a plain runtime the same way it does in a Cloudflare Worker or any
 * other fetch-compatible server.
 */
export default defineConfig({
  root: __dirname,
  test: {
    name: 'dev-auth-core',
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    reporters: ['default'],
  },
});
