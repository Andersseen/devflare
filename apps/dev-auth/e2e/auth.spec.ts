import { test, expect } from '@playwright/test';

test.describe('Auth Flow', () => {
  const testEmail = `e2e-${Date.now()}@devflare.com`;
  const testPassword = 'TestPass123';
  const testName = 'E2E Test User';

  test('user can sign up', async ({ page }) => {
    await page.goto('http://localhost:8787/signup');

    await expect(page.locator('text=Create an account')).toBeVisible();

    await page.locator('and-input[data-field="name"]').fill(testName);
    await page.locator('and-input[data-field="email"]').fill(testEmail);
    await page.locator('and-input[data-field="password"]').fill(testPassword);
    await page.locator('and-input[data-field="confirmPassword"]').fill(testPassword);

    await page.locator('and-button:has-text("Create Account")').click();

    // Should redirect or show success
    await expect(page).toHaveURL(/\/$/, { timeout: 5000 });
  });

  test('user can sign in', async ({ page }) => {
    await page.goto('http://localhost:8787/login');

    await expect(page.locator('text=Welcome back')).toBeVisible();

    await page.locator('and-input[data-field="email"]').fill(testEmail);
    await page.locator('and-input[data-field="password"]').fill(testPassword);

    await page.locator('and-button:has-text("Sign In")').click();

    await expect(page).toHaveURL(/\/$/, { timeout: 5000 });
  });

  test('user can sign out', async ({ page }) => {
    // First sign in
    await page.goto('http://localhost:8787/login');
    await page.locator('and-input[data-field="email"]').fill(testEmail);
    await page.locator('and-input[data-field="password"]').fill(testPassword);
    await page.locator('and-button:has-text("Sign In")').click();
    await expect(page).toHaveURL(/\/$/, { timeout: 5000 });

    // Then sign out via API
    await page.evaluate(async () => {
      await fetch('/api/auth/sign-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
    });

    // Verify session is gone
    const response = await page.evaluate(async () => {
      const res = await fetch('/api/auth/get-session', { credentials: 'include' });
      return res.json();
    });

    expect(response.session).toBeNull();
  });

  test('shows 404 page for unknown routes', async ({ page }) => {
    await page.goto('http://localhost:8787/nonexistent');
    await expect(page.locator('text=404')).toBeVisible();
    await expect(page.locator('text=This page doesn\'t exist')).toBeVisible();
  });
});
