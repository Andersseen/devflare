import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';

// Point BASE_URL at a deployed DevTools to run the same checks against it.
const baseURL = process.env['BASE_URL'] || 'http://localhost:4300';

/**
 * DevTools needs nothing else running for these tests: local tools have no
 * server dependency, and the connected tools' anonymous paths need only
 * DevTools' own local D1 (migrated below). The signed-in round trip in
 * connected.spec.ts is opt-in (DEVTOOLS_E2E_AUTH=1) because it needs DevAuth.
 */
export default defineConfig({
  ...nxE2EPreset(__filename, { testDir: './src' }),
  // The dev server compiles each tool page on first request; the default 5s
  // is not always enough for that on a cold start.
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    // Local D1 first: the short-link redirect reads it on the dev server.
    command:
      'pnpm exec wrangler d1 migrations apply DB --local --cwd apps/devtools && pnpm exec nx run devtools:serve',
    url: 'http://localhost:4300',
    reuseExistingServer: true,
    cwd: workspaceRoot,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
