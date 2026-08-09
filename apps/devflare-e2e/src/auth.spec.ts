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

  test('the hand-off starts a correct authorization request', async ({
    request,
  }) => {
    // Asserted on the redirect itself rather than by clicking and following the
    // browser. Following it would leave for dev-auth, which is NOT running in
    // CI — the connection is refused, the navigation never completes, and the
    // test times out having proved nothing. Reading the Location header instead
    // stops exactly at the app boundary, which is what this file is for, and
    // checks the parameters rather than merely that the URL changed.
    const response = await request.get('/api/auth/login?returnTo=/projects', {
      maxRedirects: 0,
    });

    expect(response.status()).toBe(302);

    const location = new URL(response.headers()['location']);
    expect(location.pathname).toBe('/api/auth/oauth2/authorize');
    expect(Object.fromEntries(location.searchParams)).toMatchObject({
      response_type: 'code',
      code_challenge_method: 'S256',
      scope: 'openid profile email',
    });
    expect(location.searchParams.get('client_id')).toBeTruthy();
    expect(location.searchParams.get('redirect_uri')).toBeTruthy();
    // Without these the flow has no CSRF protection and no PKCE binding.
    expect(location.searchParams.get('state')).toBeTruthy();
    expect(location.searchParams.get('code_challenge')).toBeTruthy();

    // The state and PKCE verifier are parked on DevFlare's own domain; the
    // callback cannot validate anything without them.
    expect(response.headers()['set-cookie']).toContain('df_oauth_tx=');
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
