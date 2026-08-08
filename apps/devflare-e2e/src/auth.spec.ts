import { test, expect } from '@playwright/test';

/**
 * DevFlare does not collect credentials any more. dev-auth is the identity
 * provider, so /login is a hand-off: these tests check the hand-off starts, and
 * stop at the app boundary rather than driving the provider's own pages (those
 * are covered in apps/dev-auth/e2e).
 */
test.describe('Auth Pages', () => {
  test('login page offers the provider hand-off', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('text=Welcome back')).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Continue with DevAuth/i }),
    ).toBeVisible();
  });

  test('login page collects no credentials', async ({ page }) => {
    await page.goto('/login');
    // Passwords are only ever typed into dev-auth.
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
  });

  test('sign-up redirects to the login hand-off', async ({ page }) => {
    // Account creation lives at the provider, which its own login page links to.
    await page.goto('/sign-up');
    await page.waitForURL('**/login', { timeout: 10000 });
    await expect(
      page.getByRole('button', { name: /Continue with DevAuth/i }),
    ).toBeVisible();
  });

  test('signing in leaves the app for the provider', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /Continue with DevAuth/i }).click();

    // /api/auth/login answers with a redirect to the authorization endpoint.
    await page.waitForURL(/oauth2\/authorize|\/login\?/, { timeout: 10000 });
    expect(page.url()).not.toBe('/login');
  });

  test('a failed callback surfaces the reason on the login page', async ({
    page,
  }) => {
    await page.goto('/login?error=invalid_state');
    await expect(page.locator('text=/expired/i')).toBeVisible();
  });

  test('unauthenticated users accessing protected routes see login', async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    await page.goto('/projects');

    // authGuard runs after hydration, so the redirect is client-side.
    await page.waitForURL('**/login', { timeout: 10000 });
    await expect(page.locator('text=Welcome back')).toBeVisible();
  });
});
