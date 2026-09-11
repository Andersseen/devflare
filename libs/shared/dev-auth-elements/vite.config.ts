import { defineConfig } from 'vite';

/**
 * Vitest for @org/dev-auth-elements.
 *
 * `jsdom`, not `node`: unlike dev-auth-core, this library defines real Custom
 * Elements and manipulates the DOM. `src/lib/register.spec.ts` additionally
 * runs one describe block that imports the package under a plain `node`-like
 * environment override (see that file) to prove SSR imports never touch a DOM
 * global.
 */
export default defineConfig({
  root: __dirname,
  test: {
    name: 'dev-auth-elements',
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
    reporters: ['default'],
  },
});
