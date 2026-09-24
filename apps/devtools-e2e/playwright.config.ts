import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';

// Point BASE_URL at a deployed DevTools to run the same checks against it.
const baseURL = process.env['BASE_URL'] || 'http://localhost:4300';

/**
 * DevTools needs nothing else running: no identity provider, no database, no
 * API. That independence is part of what these tests check.
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
    command: 'pnpm exec nx run devtools:serve',
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
