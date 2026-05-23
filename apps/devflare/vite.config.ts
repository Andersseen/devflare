/// <reference types="vitest" />

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
      proxy: {
        // Proxy auth requests to the dev-auth service in development
        '/api/auth': {
          target: process.env['DEV_AUTH_URL'] ?? 'http://localhost:8787',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    plugins: [
      analog({
        nitro: {
          externals: {
            external: ['better-sqlite3'],
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
