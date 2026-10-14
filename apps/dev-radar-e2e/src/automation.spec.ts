import { createHmac, randomBytes } from 'node:crypto';
import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  OWNER_SESSION_TOKEN,
  SESSION_COOKIE,
  WEBHOOK_SECRET,
} from '../fixtures/constants';

/**
 * Automations + Prompt Inbox (spec 023) against the seeded local D1 and the
 * local fake GitHub (fixtures/fake-github-server.mjs). Seeded: `api` (1001)
 * has failing CI, `web` (1002) passing CI, `docs` (1003) no CI.
 *
 * The three browser projects share one database, so each run starts by
 * disabling every rule and dismissing every prompt.
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

test.describe.configure({ mode: 'serial' });

const ORIGIN = { origin: 'http://localhost:4400' };

async function reset(request: APIRequestContext) {
  for (const id of [1001, 1002, 1003]) {
    const response = await request.put(`/api/v1/automations/${id}`, {
      data: { enabled: false, ciPolicy: 'all_workflows' },
      headers: ORIGIN,
    });
    expect(response.status()).toBe(200);
  }
  const inbox = await (
    await request.get('/api/v1/prompts?status=active')
  ).json();
  for (const prompt of inbox.prompts) {
    await request.patch(`/api/v1/prompts/${prompt.id}`, {
      data: { status: 'dismissed' },
      headers: ORIGIN,
    });
  }
}

test.beforeAll(async ({ request }) => reset(request));

test('with nothing enabled, Automations and the Prompt Inbox explain themselves', async ({
  page,
}) => {
  await page.goto('/automations');
  await expect(
    page.getByRole('heading', { name: 'Automations', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('No automation is enabled')).toBeVisible();
  // The archived repository is never offered an automation.
  await expect(page.getByText('e2e-org/legacy')).toHaveCount(0);

  await page.getByRole('link', { name: 'Prompt Inbox' }).first().click();
  await expect(
    page.getByRole('heading', { name: 'Prompt Inbox', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('No prompts here')).toBeVisible();
});

test('configure, enable, disable and re-enable an automation', async ({
  page,
}) => {
  await page.goto('/automations');

  await page.getByTestId('automation-search').fill('web');
  // Whether web is still "eligible" or already has a (disabled) rule from an
  // earlier browser project, the search finds exactly it.
  const row = page.locator(
    '[data-eligible="e2e-org/web"], [data-automation="e2e-org/web"]',
  );
  await expect(row).toHaveCount(1);
  await expect(page.locator('[data-eligible], [data-automation]')).toHaveCount(
    1,
  );
  await row.getByTestId('configure-button').click();

  const panel = page.getByTestId('automation-panel');
  await expect(panel).toContainText('e2e-org/web');
  await panel.getByTestId('rule-enabled').check();
  await panel.getByTestId('policy-required').check();
  await expect(panel.getByTestId('workflow-list')).toContainText('Build');
  await panel.getByRole('checkbox', { name: 'Build' }).check();
  await panel.getByTestId('rule-settle').fill('30');
  await panel.getByTestId('rule-save').click();
  await expect(panel.getByTestId('rule-saved')).toBeVisible();

  const active = page.getByTestId('active-automations');
  await expect(active).toContainText('e2e-org/web');
  await expect(active.locator('[data-automation-state]')).toHaveAttribute(
    'data-automation-state',
    'waiting_update',
  );

  // Settings persist across a reload.
  await page.reload();
  await page
    .locator('[data-automation="e2e-org/web"]')
    .getByTestId('configure-button')
    .click();
  await expect(page.getByTestId('policy-required')).toBeChecked();
  await expect(page.getByTestId('rule-settle')).toHaveValue('30');

  // Disable.
  await page.getByTestId('rule-enabled').uncheck();
  await page.getByTestId('rule-save').click();
  await expect(page.getByTestId('rule-saved')).toBeVisible();
  await expect(page.getByTestId('inactive-automations')).toContainText(
    'e2e-org/web',
  );
  await expect(
    page.locator('[data-automation="e2e-org/web"] [data-automation-state]'),
  ).toHaveAttribute('data-automation-state', 'disabled');
  await expect(page.getByText('No automation is enabled')).toBeVisible();

  // Re-enable.
  await page.getByTestId('rule-enabled').check();
  await page.getByTestId('rule-save').click();
  await expect(page.getByTestId('active-automations')).toContainText(
    'e2e-org/web',
  );
});

test('rejects invalid settings with a clear message', async ({ page }) => {
  await page.goto('/automations?repo=1002');
  const panel = page.getByTestId('automation-panel');
  await expect(panel).toContainText('e2e-org/web');
  await panel.getByTestId('rule-chatgpt').fill('http://evil.example/c/1');
  await panel.getByTestId('rule-save').click();
  await expect(panel.getByTestId('rule-error')).toContainText('chatgpt.com');
  await panel.getByTestId('rule-chatgpt').fill('');
});

test('manual preparation for a passing repository, then view and copy the prompt', async ({
  page,
  browserName,
  context,
}) => {
  if (browserName === 'chromium') {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  }
  await page.goto('/repositories/1002');
  const card = page.getByTestId('automation-card');
  await card.getByTestId('prepare-button').click();
  await expect(card.getByTestId('prepare-done')).toBeVisible();
  await card.getByRole('link', { name: 'Open it in the Prompt Inbox' }).click();

  await expect(
    page.getByRole('heading', { name: 'e2e-org/web' }),
  ).toBeVisible();
  const text = page.getByTestId('prompt-text');
  await expect(text).toContainText('Plan the next development of e2e-org/web');
  await expect(text).toContainText('Commit SHA: ffeeddccbbaa9988');
  await expect(text).toContainText('Customer dashboard.'); // README excerpt
  await expect(text).toContainText('not from an AI model');
  await expect(page.getByTestId('context-summary')).toContainText('README.md');
  await expect(page.getByTestId('context-missing')).toContainText('AGENTS.md');

  await page.getByTestId('copy-prompt').click();
  await expect(page.getByTestId('copy-prompt')).toContainText('Copied');
  if (browserName === 'chromium') {
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain('Commit SHA: ffeeddccbbaa9988');
  }
});

test('a failing-CI repository is blocked until the user explicitly bypasses it', async ({
  page,
}) => {
  await page.goto('/automations?repo=1001');
  const panel = page.getByTestId('automation-panel');
  await panel.getByTestId('prepare-button').click();
  await expect(panel.getByTestId('prepare-blocked')).toContainText('CI');
  await expect(panel.getByTestId('prepare-done')).toHaveCount(0);

  await panel.getByTestId('prepare-bypass').click();
  await expect(panel.getByTestId('prepare-done')).toBeVisible();
  await expect(panel.getByTestId('history')).toContainText('CI bypassed');

  await page.goto('/prompts');
  const item = page.locator('[data-prompt]').filter({ hasText: 'e2e-org/api' });
  await expect(item.first()).toContainText('CI bypassed');
  await expect(item.first()).toContainText('Manual');
});

test('a repository without CI is blocked, and says it is not treated as passing', async ({
  page,
}) => {
  await page.goto('/automations?repo=1003');
  const panel = page.getByTestId('automation-panel');
  await panel.getByTestId('prepare-button').click();
  await expect(panel.getByTestId('prepare-blocked')).toContainText(
    'without CI',
  );
});

test('the inbox filters by repository and status, and dismiss/restore works', async ({
  page,
}) => {
  await page.goto('/prompts');
  const items = page.locator('[data-prompt]');
  await expect(items.filter({ hasText: 'e2e-org/web' })).toHaveCount(1);
  await expect(items.filter({ hasText: 'e2e-org/api' })).toHaveCount(1);

  await page
    .getByTestId('filter-repository')
    .selectOption({ label: 'e2e-org/api' });
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText('e2e-org/api');

  const id = await items.first().getAttribute('data-prompt');
  await items.first().getByTestId('dismiss').click();
  await expect(page.getByText('No prompts here')).toBeVisible();

  // Earlier browser projects leave their own dismissed prompts behind, so look
  // for this run's prompt by id.
  await page.getByTestId('filter-status').selectOption('dismissed');
  const mine = page.locator(`[data-prompt="${id}"]`);
  await expect(mine).toHaveAttribute('data-prompt-status', 'dismissed');
  await mine.getByRole('button', { name: 'Restore' }).click();
  await page.getByTestId('filter-status').selectOption('active');
  await expect(items).toHaveCount(1);
  await expect(items.first()).toHaveAttribute('data-prompt', id ?? '');

  // The list copy action copies without opening the prompt.
  await page.getByTestId('filter-repository').selectOption('');
  await items
    .filter({ hasText: 'e2e-org/web' })
    .getByTestId('copy-prompt')
    .click();
  await expect(
    items.filter({ hasText: 'e2e-org/web' }).getByTestId('copy-prompt'),
  ).toContainText('Copied');
});

test('opening the optional ChatGPT conversation link is offered only when configured', async ({
  page,
  request,
}) => {
  await request.put('/api/v1/automations/1002', {
    data: {
      enabled: false,
      ciPolicy: 'all_workflows',
      chatgptUrl: 'https://chatgpt.com/c/e2e-conversation',
    },
    headers: ORIGIN,
  });
  await page.goto('/prompts');
  await page
    .locator('[data-prompt]')
    .filter({ hasText: 'e2e-org/web' })
    .getByTestId('view-prompt')
    .click();
  const link = page.getByTestId('open-chatgpt');
  await expect(link).toHaveAttribute(
    'href',
    'https://chatgpt.com/c/e2e-conversation',
  );
  await expect(link).toHaveAttribute('rel', /noopener/);
  await expect(page.getByText('only opens your conversation')).toBeVisible();
});

test('a default-branch push shows "Waiting for CI" until CI reports for that exact commit', async ({
  page,
  request,
}) => {
  // Enable on docs, with no settling time, then push a commit that has no CI yet.
  const saved = await request.put('/api/v1/automations/1003', {
    data: { enabled: true, ciPolicy: 'all_workflows', settleSeconds: 0 },
    headers: ORIGIN,
  });
  expect(saved.status()).toBe(200);

  const sha = randomBytes(8).toString('hex'); // unique per browser project
  const payload = JSON.stringify({
    ref: 'refs/heads/main',
    after: sha,
    deleted: false,
    commits: [{ id: sha }],
    head_commit: {
      id: sha,
      message: 'feat: automation e2e push',
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
      'x-github-delivery': `e2e-auto-${sha}`,
      'x-hub-signature-256': `sha256=${createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex')}`,
    },
  });
  expect(response.status()).toBe(200);

  await page.goto('/automations?repo=1003');
  const row = page.locator('[data-automation="e2e-org/docs"]');
  // No workflow has reported for the new commit, so nothing is prepared.
  await expect(row.locator('[data-automation-state]')).toHaveAttribute(
    'data-automation-state',
    /waiting_ci|blocked/,
  );
  await expect(page.getByTestId('history')).toContainText(sha.slice(0, 7));

  // Idempotent: the same commit delivered again adds no second run.
  await request.post('/api/github/webhook', {
    data: payload,
    headers: {
      'content-type': 'application/json',
      'x-github-event': 'push',
      'x-github-delivery': `e2e-auto-again-${sha}`,
      'x-hub-signature-256': `sha256=${createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex')}`,
    },
  });
  await page.reload();
  await expect(
    page
      .getByTestId('history')
      .locator('li')
      .filter({ hasText: sha.slice(0, 7) }),
  ).toHaveCount(1);
});

test('the Prompt Inbox and Automations are usable on a phone-width screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 700 });
  for (const path of ['/automations', '/prompts']) {
    await page.goto(path);
    await expect(
      page.getByRole('navigation', { name: 'Primary' }),
    ).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow, path).toBe(false);
  }
});
