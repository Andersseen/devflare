import { generateKeyPairSync } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';
import { FAKE_GITHUB_PORT, WEBHOOK_SECRET } from './fixtures/constants';

// Point BASE_URL at a deployed DevRadar to run the read-only checks against it.
const baseURL = process.env['BASE_URL'] || 'http://localhost:4400';

/**
 * DevRadar's E2E needs nothing else running and never reaches GitHub or
 * DevAuth: the dev server runs on a LOCAL D1 that is migrated and seeded with
 * synthetic fixtures (fixtures/seed.mjs) — two sessions, one on the allowlist
 * and one not — and the specs present the seeded session cookie. The webhook
 * secret and a throwaway App key are injected through the environment of the
 * dev server only; nothing real is ever configured here.
 */
const throwawayKey = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
}).privateKey;

export default defineConfig({
  ...nxE2EPreset(__filename, { testDir: './src' }),
  // The dev server compiles each page on first request.
  expect: { timeout: 15_000 },
  // Specs share one seeded database, and a webhook test mutates it.
  workers: 1,
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: [
    {
      // GitHub stand-in: automation reads repositories through it, never the
      // real API (DevRadar is pointed here by GITHUB_API_BASE_URL below).
      command: 'node apps/dev-radar-e2e/fixtures/fake-github-server.mjs',
      url: `http://127.0.0.1:${FAKE_GITHUB_PORT}/repos/e2e-org/api/commits`,
      reuseExistingServer: !!process.env['E2E_REUSE_SERVER'],
      cwd: workspaceRoot,
      timeout: 30_000,
      env: { FAKE_GITHUB_PORT: String(FAKE_GITHUB_PORT) },
    },
    {
      command:
        'pnpm exec wrangler d1 migrations apply DB --local --cwd apps/dev-radar && node apps/dev-radar-e2e/fixtures/seed.mjs && pnpm exec nx run dev-radar:serve',
      url: 'http://localhost:4400',
      // A server someone left running would carry a different webhook secret and
      // an unseeded database; only reuse one outside CI when explicitly asked.
      reuseExistingServer: !!process.env['E2E_REUSE_SERVER'],
      cwd: workspaceRoot,
      timeout: 180_000,
      env: {
        GITHUB_WEBHOOK_SECRET: WEBHOOK_SECRET,
        GITHUB_APP_ID: '424242',
        GITHUB_APP_SLUG: 'dev-radar-e2e',
        GITHUB_APP_PRIVATE_KEY: throwawayKey,
        GITHUB_API_BASE_URL: `http://127.0.0.1:${FAKE_GITHUB_PORT}`,
      },
    },
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
