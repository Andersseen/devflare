import { defineConfig } from 'vite';

/**
 * Vitest for @org/dashboard-layout. `node`: what is worth testing here is the
 * pure layout logic and the signal-based editor, neither needs a DOM.
 */
export default defineConfig({
  root: __dirname,
  test: {
    name: 'dashboard-layout',
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    reporters: ['default'],
  },
});
