import { defineConfig } from 'vite';

/**
 * Vitest for @org/deploy.
 *
 * `node` rather than `jsdom`: the parts of this library worth testing — the
 * asset hash, the ignore rules, the bucket packer, the upload orchestration —
 * are pure logic over plain values. The one place that genuinely needs the DOM
 * (turning a picked directory into `File` objects) is a thin edge tested from
 * the app, the same split `@org/core` uses.
 */
export default defineConfig({
  root: __dirname,
  test: {
    name: 'deploy',
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    reporters: ['default'],
  },
});
