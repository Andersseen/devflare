import { test, expect } from '@playwright/test';

test.describe('DevFlare App', () => {
  test('has title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/DevFlare/);
  });

  test('login page is accessible', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('text=Welcome back')).toBeVisible();
    // Credentials live at the identity provider — see auth.spec.ts.
    await expect(
      page.getByRole('button', { name: /Continue with DevAuth/i }),
    ).toBeVisible();
  });
});
