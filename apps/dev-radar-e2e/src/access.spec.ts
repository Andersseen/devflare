import { createHmac } from 'node:crypto';
import { test, expect } from '@playwright/test';
import {
  BLOCKED_SESSION_TOKEN,
  SESSION_COOKIE,
  WEBHOOK_SECRET,
} from '../fixtures/constants';

/**
 * The boundary: who gets in, and what the API refuses. Needs only DevRadar
 * (local D1, seeded by fixtures/seed.mjs) — never DevAuth or GitHub.
 */

const PROTECTED_PAGES = [
  '/',
  '/repositories',
  '/pull-requests',
  '/activity',
  '/settings',
];
const PROTECTED_API = [
  '/api/v1/access',
  '/api/v1/overview',
  '/api/v1/repositories',
  '/api/v1/repositories/1001',
  '/api/v1/pull-requests',
  '/api/v1/activity',
  '/api/v1/settings',
];

test.describe('anonymous visitors', () => {
  for (const path of PROTECTED_PAGES) {
    test(`${path} offers DevAuth sign-in and shows no data`, async ({
      page,
    }) => {
      await page.goto(path);
      await expect(page.locator('dev-auth-sign-in')).toBeVisible();
      await expect(
        page.getByRole('navigation', { name: 'Primary' }),
      ).toHaveCount(0);
      await expect(page.getByText('e2e-org/api')).toHaveCount(0);
    });
  }

  test('every dashboard API answers 401', async ({ request }) => {
    for (const path of PROTECTED_API) {
      expect((await request.get(path)).status(), path).toBe(401);
    }
  });

  test('manual sync is refused', async ({ request }) => {
    const response = await request.post('/api/v1/sync', {
      headers: { origin: 'http://localhost:4400' },
    });
    expect(response.status()).toBe(401);
  });

  test('sign-in starts an authorization code + PKCE flow as DevRadar’s own client', async ({
    request,
  }) => {
    const response = await request.get(
      '/api/auth/login?returnTo=/repositories',
      { maxRedirects: 0 },
    );
    expect(response.status()).toBe(302);
    const location = new URL(response.headers()['location']);
    expect(location.pathname).toMatch(/\/oauth2\/authorize$/);
    expect(location.searchParams.get('client_id')).toBe('dev-radar-dev');
    expect(location.searchParams.get('redirect_uri')).toBe(
      'http://localhost:4400/api/auth/callback',
    );
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(location.searchParams.get('state')).toBeTruthy();

    const cookie = response.headers()['set-cookie'];
    expect(cookie).toMatch(/dr_oauth_tx=/);
    expect(cookie).toMatch(/HttpOnly/i);
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
      /dr_session=[^;]/,
    );
  });
});

test.describe('a signed-in account that is not on the allowlist', () => {
  test.use({
    storageState: {
      cookies: [
        {
          name: SESSION_COOKIE,
          value: BLOCKED_SESSION_TOKEN,
          domain: 'localhost',
          path: '/',
          httpOnly: true,
          secure: false,
          sameSite: 'Lax',
          expires: -1,
        },
      ],
      origins: [],
    },
  });

  test('is told it has no access and sees no data', async ({ page }) => {
    await page.goto('/repositories');
    await expect(page.getByTestId('access-denied')).toBeVisible();
    await expect(page.getByText('No access to DevRadar')).toBeVisible();
    await expect(page.getByText('e2e-org/api')).toHaveCount(0);
  });

  test('every dashboard API answers 403, not 401 and not data', async ({
    request,
    context,
  }) => {
    expect((await request.get('/api/v1/access')).status()).toBe(200);
    expect((await (await request.get('/api/v1/access')).json()).allowed).toBe(
      false,
    );
    for (const path of PROTECTED_API.filter((p) => p !== '/api/v1/access')) {
      expect((await context.request.get(path)).status(), path).toBe(403);
    }
  });
});

test.describe('GitHub webhook endpoint', () => {
  const body = JSON.stringify({ zen: 'Keep it logically awesome.' });
  const sign = (payload: string, secret = WEBHOOK_SECRET) =>
    `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
  const headers = (
    signature: string,
    event = 'ping',
    delivery = `e2e-${Math.random()}`,
  ) => ({
    'content-type': 'application/json',
    'x-hub-signature-256': signature,
    'x-github-event': event,
    'x-github-delivery': delivery,
  });

  test('rejects a missing, malformed or wrong signature', async ({
    request,
  }) => {
    for (const signature of [
      '',
      'sha256=zzzz',
      sign(body, 'wrong-secret'),
      sign(body + ' '),
    ]) {
      const response = await request.post('/api/github/webhook', {
        data: body,
        headers: headers(signature),
      });
      expect(response.status(), signature).toBe(401);
    }
  });

  test('accepts a correctly signed delivery and treats a replay as a duplicate', async ({
    request,
  }) => {
    const delivery = `e2e-replay-${Date.now()}`;
    const first = await request.post('/api/github/webhook', {
      data: body,
      headers: headers(sign(body), 'ping', delivery),
    });
    expect(first.status()).toBe(200);
    expect(await first.json()).toEqual({ result: 'ignored', reason: 'ping' });

    const replay = await request.post('/api/github/webhook', {
      data: body,
      headers: headers(sign(body), 'ping', delivery),
    });
    expect(replay.status()).toBe(200);
    expect(await replay.json()).toEqual({ result: 'duplicate' });
  });
});
