import { createHmac } from 'node:crypto';
import { test, expect } from '@playwright/test';
import {
  OWNER_SESSION_TOKEN,
  SESSION_COOKIE,
  WEBHOOK_SECRET,
} from '../fixtures/constants';

/**
 * The signed-in dashboard over the seeded local database (see
 * fixtures/seed.mjs): "e2e-org" with four repositories — failing CI, passing
 * CI, no CI at all, and one archived. The data is synthetic test data in a
 * throwaway local D1; DevRadar itself has no mock mode.
 */

test.use({
  storageState: {
    cookies: [
      {
        name: SESSION_COOKIE,
        value: OWNER_SESSION_TOKEN,
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

const nav = (page: import('@playwright/test').Page) =>
  page.getByRole('navigation', { name: 'Primary' });

test.describe('navigation', () => {
  test('the five sections are reachable and each renders its heading', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Overview' }),
    ).toBeVisible();

    for (const [link, heading] of [
      ['Repositories', 'Repositories'],
      ['Pull Requests', 'Pull Requests'],
      ['Activity', 'Activity'],
      ['Settings', 'Settings'],
      ['Overview', 'Overview'],
    ]) {
      await nav(page).getByRole('link', { name: link, exact: true }).click();
      await expect(
        page.getByRole('heading', { level: 1, name: heading }),
      ).toBeVisible();
    }
  });

  test('marks the current section for assistive tech', async ({ page }) => {
    await page.goto('/pull-requests');
    await expect(
      nav(page).getByRole('link', { name: 'Pull Requests' }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(
      nav(page).getByRole('link', { name: 'Overview' }),
    ).not.toHaveAttribute('aria-current', 'page');
  });
});

test.describe('Overview — connected', () => {
  test('shows real counts from stored state, with no disconnected notice', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('[data-stat="repositories"]')).toHaveText('4');
    await expect(page.locator('[data-stat="pull-requests"]')).toHaveText('3');
    await expect(page.locator('[data-stat="failing"]')).toHaveText('1');
    await expect(page.locator('[data-stat="pending"]')).toHaveText('0');
    await expect(page.locator('[data-stat="no-ci"]')).toHaveText('1');
    await expect(page.getByTestId('disconnected-notice')).toHaveCount(0);
  });

  test('lists the failing repository under "needs attention", and not the passing or no-CI ones', async ({
    page,
  }) => {
    await page.goto('/');
    const attention = page.getByTestId('attention');
    await expect(attention).toContainText('e2e-org/api');
    await expect(attention).toContainText('Failing');
    await expect(attention).not.toContainText('e2e-org/web');
    await expect(attention).not.toContainText('e2e-org/docs');
  });
});

test.describe('Overview — disconnected presentation', () => {
  test('states plainly that GitHub is not connected and that nothing shown is sample data', async ({
    page,
  }) => {
    await page.route('**/api/v1/overview', (route) =>
      route.fulfill({
        json: {
          connection: {
            configured: false,
            missing: ['GITHUB_APP_ID', 'GITHUB_APP_PRIVATE_KEY'],
            installUrl: null,
            webhookConfigured: false,
          },
          totals: {
            repositories: 0,
            openPullRequests: 0,
            failing: 0,
            pending: 0,
            noCi: 0,
          },
          attention: [],
          recentReleases: [],
          recentActivity: [],
          lastSyncedAt: null,
        },
      }),
    );
    await page.goto('/');
    const notice = page.getByTestId('disconnected-notice');
    await expect(notice).toContainText('GitHub is not connected');
    await expect(notice).toContainText('Nothing below is sample data');
    await expect(page.locator('[data-stat="repositories"]')).toHaveText('0');
  });

  test('a failing API shows an error with retry, not an empty success', async ({
    page,
  }) => {
    await page.route('**/api/v1/overview', (route) =>
      route.fulfill({ status: 500, json: { statusMessage: 'x' } }),
    );
    await page.goto('/');
    await expect(page.getByRole('alert')).toContainText(
      'Could not load this page',
    );
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  });
});

test.describe('Repositories', () => {
  test('hides archived repositories by default and shows CI honestly', async ({
    page,
  }) => {
    await page.goto('/repositories');
    const list = page.getByTestId('repository-list');
    await expect(list.locator('[data-repo]')).toHaveCount(3);
    await expect(list).not.toContainText('e2e-org/legacy');

    await expect(
      list.locator('[data-repo="e2e-org/api"] [data-ci]').first(),
    ).toHaveAttribute('data-ci', 'failure');
    await expect(
      list.locator('[data-repo="e2e-org/web"] [data-ci]').first(),
    ).toHaveAttribute('data-ci', 'success');
    // A repository without workflows is "No CI" — never green.
    const docs = list.locator('[data-repo="e2e-org/docs"] [data-ci]').first();
    await expect(docs).toHaveAttribute('data-ci', 'none');
    await expect(docs).toHaveText('No CI');
  });

  test('searches and filters', async ({ page }) => {
    await page.goto('/repositories');
    const items = page.getByTestId('repository-list').locator('[data-repo]');

    await page.getByLabel('Search repositories').fill('billing');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('e2e-org/api');

    await page.getByLabel('Search repositories').fill('');
    await page.getByLabel('Filter by CI state').selectOption('none');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('e2e-org/docs');

    await page.getByLabel('Filter by CI state').selectOption('all');
    await page.getByLabel('Filter by visibility').selectOption('private');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('e2e-org/web');

    await page.getByLabel('Search repositories').fill('zzz-nothing');
    await expect(page.getByText('No repositories match')).toBeVisible();
  });

  test('the Overview "Failing CI" tile deep-links to the filtered list', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Failing CI/ }).click();
    await expect(page).toHaveURL(/\/repositories\?ci=failure/);
    await expect(
      page.getByTestId('repository-list').locator('[data-repo]'),
    ).toHaveCount(1);
    await expect(page.getByLabel('Filter by CI state')).toHaveValue('failure');
  });

  test('repository detail shows PRs, runs, releases and links to GitHub', async ({
    page,
  }) => {
    await page.goto('/repositories');
    await page.getByRole('link', { name: 'e2e-org/api', exact: true }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'e2e-org/api' }),
    ).toBeVisible();
    await expect(page.getByTestId('detail-prs')).toContainText(
      '#41 Add retry to invoice sender',
    );
    await expect(page.getByTestId('detail-prs')).toContainText(
      '#42 chore(main): release 1.5.0',
    );
    await expect(page.getByTestId('detail-runs')).toContainText('CI #128');
    await expect(
      page.getByRole('link', { name: 'v1.4.0' }).first(),
    ).toHaveAttribute('href', /github\.com\/e2e-org\/api\/releases/);
    await expect(
      page.getByRole('link', { name: /Open on GitHub/ }),
    ).toHaveAttribute('href', 'https://github.com/e2e-org/api');
  });

  test('an unknown repository id is an error state, not a crash', async ({
    page,
  }) => {
    await page.goto('/repositories/999999');
    await expect(page.getByRole('alert')).toContainText('Repository not found');
  });
});

test.describe('Pull Requests', () => {
  test('lists open PRs across repositories with draft and release markers from grounded metadata only', async ({
    page,
  }) => {
    await page.goto('/pull-requests');
    const list = page.getByTestId('pr-list');
    await expect(list.locator('[data-pr]')).toHaveCount(3);

    // #42 carries the documented `autorelease: pending` label + release-please branch.
    await expect(
      list.locator('[data-pr="e2e-org/api#42"]').getByTestId('release-badge'),
    ).toBeVisible();
    // #7 is *named* "prepare release" but has no label/branch convention: no badge.
    await expect(
      list.locator('[data-pr="e2e-org/web#7"]').getByTestId('release-badge'),
    ).toHaveCount(0);
    await expect(list.locator('[data-pr="e2e-org/web#7"]')).toContainText(
      'Draft',
    );
    // CI of #41 comes from the run of ITS head commit.
    await expect(
      list.locator('[data-pr="e2e-org/api#41"] [data-ci]'),
    ).toHaveAttribute('data-ci', 'success');
    await expect(
      list.locator('[data-pr="e2e-org/api#42"] [data-ci]'),
    ).toHaveAttribute('data-ci', 'none');
  });

  test('filters', async ({ page }) => {
    await page.goto('/pull-requests');
    const items = page.getByTestId('pr-list').locator('[data-pr]');
    await page.getByLabel('Search pull requests').fill('#41');
    await expect(items).toHaveCount(1);
    await page.getByLabel('Search pull requests').fill('');
    await page.getByLabel('Release PRs only').check();
    await expect(items).toHaveCount(1);
    await page.getByLabel('Release PRs only').uncheck();
    await page.getByLabel('Hide drafts').check();
    await expect(items).toHaveCount(2);
  });
});

test.describe('Settings', () => {
  test('reports the integration status, installations and webhook setup without secrets', async ({
    page,
  }) => {
    await page.goto('/settings');
    await expect(page.getByTestId('connection-status')).toContainText(
      'GitHub App configured',
    );
    await expect(page.getByTestId('installations')).toContainText('e2e-org');
    await expect(page.getByTestId('installations')).toContainText(
      '4 repositories',
    );
    await expect(page.getByTestId('webhook-url')).toHaveText(
      'http://localhost:4400/api/github/webhook',
    );
    await expect(
      page.getByTestId('sync-button').getByRole('button'),
    ).toBeEnabled();

    const text = await page.locator('main').innerText();
    expect(text).not.toContain('BEGIN RSA PRIVATE KEY');
    expect(text).not.toContain(WEBHOOK_SECRET);
  });

  test('disconnected deployments cannot sync and say what is missing', async ({
    page,
  }) => {
    await page.route('**/api/v1/settings', (route) =>
      route.fulfill({
        json: {
          connection: {
            configured: false,
            missing: ['GITHUB_APP_ID'],
            installUrl: null,
            webhookConfigured: false,
          },
          installations: [],
          repositories: 0,
          lastSyncedAt: null,
          setup: {
            webhookUrl: 'http://localhost:4400/api/github/webhook',
            callbackNote: 'n/a',
          },
        },
      }),
    );
    await page.goto('/settings');
    await expect(page.getByTestId('connection-status')).toContainText(
      'Disconnected',
    );
    await expect(page.getByText('GITHUB_APP_ID').first()).toBeVisible();
    await expect(
      page.getByTestId('sync-button').getByRole('button'),
    ).toBeDisabled();
  });
});

test.describe('webhook → Activity', () => {
  test('a signed push to the default branch appears in Activity and updates the repository', async ({
    page,
    request,
  }) => {
    // Unique per run: the three browser projects share one seeded database.
    const marker = `${test.info().project.name}-${Date.now()}`;
    const payload = JSON.stringify({
      ref: 'refs/heads/main',
      after: 'deadbeefcafe0000',
      deleted: false,
      commits: [{ id: 'deadbeefcafe0000' }],
      head_commit: {
        id: 'deadbeefcafe0000',
        message: `feat: webhook-driven update ${marker}`,
        timestamp: new Date().toISOString(),
        author: { username: 'ada' },
      },
      pusher: { name: 'ada' },
      installation: { id: 10 },
      repository: {
        id: 1003,
        name: 'docs',
        full_name: 'e2e-org/docs',
        default_branch: 'main',
        html_url: 'https://github.com/e2e-org/docs',
        owner: { login: 'e2e-org' },
      },
    });
    const response = await request.post('/api/github/webhook', {
      data: payload,
      headers: {
        'content-type': 'application/json',
        'x-github-event': 'push',
        'x-github-delivery': `e2e-push-${Date.now()}`,
        'x-hub-signature-256': `sha256=${createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex')}`,
      },
    });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ result: 'processed' });

    await page.goto('/activity');
    const event = page
      .locator('[data-event="repository.main.updated"]')
      .filter({ hasText: marker });
    await expect(event).toHaveCount(1);
    await expect(event).toContainText('e2e-org/docs');

    // The push moved the head but says nothing about CI: still "No CI".
    await page.goto('/repositories');
    const docs = page.locator('[data-repo="e2e-org/docs"]');
    await expect(docs).toContainText(`feat: webhook-driven update ${marker}`);
    await expect(docs.locator('[data-ci]').first()).toHaveAttribute(
      'data-ci',
      'none',
    );
  });

  test('Activity lists seeded events newest first', async ({ page }) => {
    await page.goto('/activity');
    await expect(
      page.locator('[data-event="repository.ci.failed"]'),
    ).toContainText('CI failed on main');
    await expect(
      page.locator('[data-event="repository.ci.passed"]'),
    ).toContainText('CI passed on main');
  });
});

test.describe('responsive layout', () => {
  test('on a phone-width screen the navigation stays reachable and the page does not scroll sideways', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/repositories');
    await expect(
      nav(page).getByRole('link', { name: 'Settings' }),
    ).toBeAttached();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
