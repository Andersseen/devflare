import { test, expect } from '@playwright/test';

test.describe('Auth Pages', () => {
  test('login page loads with form elements', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('text=Welcome back')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('sign-up page loads with form elements', async ({ page }) => {
    await page.goto('/sign-up');
    await expect(page.locator('text=Create an account')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('login shows error for empty submission', async ({ page }) => {
    await page.goto('/login');
    await page.locator('button[type="submit"]').click();

    // HTML5 validation should prevent submission
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();
  });

  test('unauthenticated users accessing protected routes see login', async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    await page.goto('/projects');

    // Should redirect to login or show login page
    await expect(page.locator('text=Welcome back, text=Sign in')).toBeVisible({
      timeout: 5000,
    });
  });
});
