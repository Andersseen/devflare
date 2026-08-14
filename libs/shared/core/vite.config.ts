import { defineConfig } from 'vite';

/**
 * Vitest for @org/core.
 *
 * The library holds DevFlare's business logic and had no runner at all, so its
 * colocated specs never executed — CONVENTIONS.md asks for them, but
 * `nx run-many -t test` had no `test` target here to run.
 *
 * `node` rather than `jsdom`: what is worth testing in this library is pure
 * logic. A service that needs the DOM or Angular's injector should be tested
 * from the app, which already has the Angular test setup.
 */
export default defineConfig({
  root: __dirname,
  test: {
    name: 'core',
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    reporters: ['default'],
  },
});
