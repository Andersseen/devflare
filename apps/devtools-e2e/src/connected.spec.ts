import { test, expect, type Page } from '@playwright/test';

/**
 * Connected tools. The anonymous half runs everywhere: it needs only DevTools
 * (its dev server applies the local D1 migrations first, see
 * playwright.config.ts). The authenticated round trip needs DevAuth on :8787
 * with the seeded test user (`pnpm dev:auth`, `pnpm seed:user`) and is opt-in:
 * DEVTOOLS_E2E_AUTH=1. No test reaches a real third-party domain.
 */

const SHORT_LINKS_API = '/api/v1/short-links';

/** Through the real DevAuth login page and back to `path`. */
async function signIn(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.locator('dev-auth-sign-in and-button').click();

  await page.waitForURL(/localhost:8787/);
  // The <input> lives inside each and-input's (open) shadow root.
  await page
    .locator('and-input[data-field="email"] input')
    .fill('test@devflare.com');
  await page
    .locator('and-input[data-field="password"] input')
    .fill('TestPass123');
  await page.locator('and-button:has-text("Sign In")').click();

  await page.waitForURL(`**${path}`);
  await expect(page.locator('dev-auth-user-button')).toBeVisible();
}

test.describe('connected tools, anonymously', () => {
  for (const [path, heading] of [
    ['/short-links', 'Short Links'],
    ['/domain-inspector', 'Domain Inspector'],
  ]) {
    test(`${heading} offers DevAuth sign-in instead of the tool`, async ({
      page,
    }) => {
      await page.goto(path);
      await expect(
        page.getByRole('heading', { level: 1, name: heading }),
      ).toBeVisible();
      await expect(page.locator('dev-auth-sign-in')).toBeVisible();
      await expect(page.getByLabel('Destination')).toHaveCount(0);
      await expect(page.getByLabel('Domain or URL')).toHaveCount(0);
    });
  }

  test('sign-in starts an authorization code + PKCE flow as DevTools', async ({
    request,
  }) => {
    const response = await request.get(
      '/api/auth/login?returnTo=/short-links',
      {
        maxRedirects: 0,
      },
    );
    expect(response.status()).toBe(302);

    const location = new URL(response.headers()['location']);
    expect(location.pathname).toMatch(/\/oauth2\/authorize$/);
    expect(location.searchParams.get('client_id')).toBe('devtools-dev');
    expect(location.searchParams.get('redirect_uri')).toBe(
      'http://localhost:4300/api/auth/callback',
    );
    expect(location.searchParams.get('response_type')).toBe('code');
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(location.searchParams.get('state')).toBeTruthy();
    expect(location.searchParams.get('nonce')).toBeTruthy();

    const cookie = response.headers()['set-cookie'] ?? '';
    expect(cookie).toMatch(/dt_oauth_tx=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).not.toMatch(/df_session/);
  });

  test('a callback with a forged state never creates a session', async ({
    request,
  }) => {
    const response = await request.get(
      '/api/auth/callback?code=stolen&state=forged',
      { maxRedirects: 0 },
    );
    expect(response.status()).toBe(302);
    expect(response.headers()['location']).toBe('/?auth_error=invalid_state');
    expect(response.headers()['set-cookie'] ?? '').not.toMatch(
      /dt_session=[^;]/,
    );
  });

  test('connected APIs refuse anonymous callers', async ({ request }) => {
    expect((await request.get(SHORT_LINKS_API)).status()).toBe(401);
    expect((await request.get('/api/v1/access')).status()).toBe(401);
    const post = await request.post(SHORT_LINKS_API, {
      data: { slug: 'x', destination: 'https://x.example' },
      headers: { origin: 'http://localhost:4300' },
    });
    expect(post.status()).toBe(401);
  });

  test('mutations from another origin are refused before anything else', async ({
    request,
  }) => {
    const response = await request.post(SHORT_LINKS_API, {
      data: { slug: 'x', destination: 'https://x.example' },
      headers: { origin: 'https://evil.example' },
    });
    expect(response.status()).toBe(403);
    const inspect = await request.post('/api/v1/domain-inspector', {
      data: { target: 'example.com' },
      headers: { origin: 'https://evil.example' },
    });
    expect(inspect.status()).toBe(403);
  });

  test('an unknown short link is a 404, not an app page', async ({
    request,
  }) => {
    const response = await request.get('/api/go/no-such-link-e2e', {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(404);
    expect(response.headers()['cache-control']).toBe('no-store');
  });
});

test.describe('connected tools, signed in', () => {
  test.skip(
    process.env['DEVTOOLS_E2E_AUTH'] !== '1',
    'Needs DevAuth on :8787 with the seeded test user; set DEVTOOLS_E2E_AUTH=1.',
  );

  test('sign in through DevAuth, then manage a short link end to end', async ({
    page,
    request,
  }) => {
    const slug = `e2e-${Date.now().toString(36)}`;

    await signIn(page, '/short-links');

    await page.getByLabel('Slug').fill(slug);
    await page.getByLabel('Destination').fill('https://example.com/e2e');
    await page.getByRole('button', { name: /Create link/ }).click();

    const item = page.locator(`li[data-slug="${slug}"]`);
    await expect(item).toContainText('https://example.com/e2e');

    // The public redirect: no session involved.
    const redirect = await request.get(`/api/go/${slug}`, { maxRedirects: 0 });
    expect(redirect.status()).toBe(302);
    expect(redirect.headers()['location']).toBe('https://example.com/e2e');

    await item.getByRole('button', { name: 'Edit' }).click();
    await item.locator('input[type="url"]').fill('https://example.com/edited');
    await item.getByRole('button', { name: 'Save' }).click();
    await expect(item).toContainText('https://example.com/edited');

    await item.getByRole('button', { name: /Disable/ }).click();
    await expect(item).toContainText('Disabled');
    expect(
      (await request.get(`/api/go/${slug}`, { maxRedirects: 0 })).status(),
    ).toBe(410);

    page.once('dialog', (dialog) => dialog.accept());
    await item.getByRole('button', { name: /Delete/ }).click();
    await expect(item).toHaveCount(0);
    expect(
      (await request.get(`/api/go/${slug}`, { maxRedirects: 0 })).status(),
    ).toBe(404);
  });

  test('Domain Inspector renders a report (upstream mocked)', async ({
    page,
  }) => {
    // The server-side fetch is covered by unit tests with an injected
    // network; here the API answer is fixed so CI never touches a real domain.
    await page.route('**/api/v1/domain-inspector', (route) =>
      route.fulfill({
        json: {
          target: {
            input: 'example.com',
            hostname: 'example.com',
            url: 'https://example.com/',
          },
          dns: [
            {
              type: 'A',
              status: 'ok',
              records: [
                {
                  name: 'example.com',
                  type: 'A',
                  ttl: 60,
                  data: '93.184.215.14',
                },
              ],
            },
          ],
          http: {
            hops: [
              {
                url: 'https://example.com/',
                status: 200,
                statusText: 'OK',
                headers: [],
                addresses: ['93.184.215.14'],
                durationMs: 42,
              },
            ],
            finalUrl: 'https://example.com/',
          },
          headers: {
            findings: [
              {
                id: 'xcto.missing',
                header: 'X-Content-Type-Options',
                status: 'missing',
                title: 'No X-Content-Type-Options',
                detail: '…',
              },
            ],
            counts: { present: 0, missing: 1, weak: 0, info: 0 },
          },
          hints: [{ provider: 'Cloudflare', evidence: 'cf-ray: x' }],
          inspectedAt: new Date(0).toISOString(),
        },
      }),
    );

    await signIn(page, '/domain-inspector');
    await page.getByLabel('Domain or URL').fill('example.com');
    await page.getByRole('button', { name: /Inspect/ }).click();

    await expect(page.getByText('Final URL:')).toBeVisible();
    await expect(page.getByText('No X-Content-Type-Options')).toBeVisible();
    await expect(page.getByText('93.184.215.14').first()).toBeVisible();
  });
});
