import { test, expect } from '@playwright/test';

/**
 * The browser utilities moved out of DevFlare into the standalone DevTools app
 * (apps/devtools). DevFlare must not render any of them any more.
 *
 * The production Worker also forwards old /tools/* URLs to DevTools when
 * DEVTOOLS_URL is set (src/server/routes/tools, unit-tested in
 * server/lib/legacy-tools.spec.ts). That route cannot be exercised here: the
 * Analog dev server only hands `/api/*` to Nitro, so in dev an old tool URL
 * goes through the not-found redirect instead.
 */
test.describe('DevTools split', () => {
  for (const path of ['/tools', '/tools/palette', '/tools/qr-generator']) {
    test(`${path} is not a DevFlare page`, async ({ page }) => {
      await page.goto(path);
      await page.waitForURL((url) => !url.pathname.startsWith('/tools'));

      await expect(
        page.getByRole('heading', { name: /Cinematic Palette|QR Code Studio/ }),
      ).toHaveCount(0);
    });
  }
});
