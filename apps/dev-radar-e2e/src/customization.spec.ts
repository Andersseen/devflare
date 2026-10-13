import { test, expect, type APIRequestContext } from '@playwright/test';
import { OWNER_SESSION_TOKEN, SESSION_COOKIE } from '../fixtures/constants';

/**
 * Dashboard customization (spec 022) against the seeded local D1. The owner
 * follows all four seeded repositories; every test ends by restoring that, as
 * the three browser projects share one database.
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

const ALL = ['1001', '1003', '1004', '1002']; // api, docs, legacy, web

async function putLayout(
  request: APIRequestContext,
  layout: {
    groups?: { id: string; name: string; itemIds: string[] }[];
    ungroupedIds: string[];
  },
) {
  const response = await request.put('/api/v1/dashboard-layout', {
    data: { groups: [], hiddenIds: [], pinnedIds: [], ...layout },
    headers: { origin: 'http://localhost:4400' },
  });
  expect(response.status()).toBe(200);
}

test.beforeEach(async ({ request }) =>
  putLayout(request, { ungroupedIds: ALL }),
);
test.afterAll(async ({ request }) => putLayout(request, { ungroupedIds: ALL }));

test('only followed repositories feed the dashboard and its totals', async ({
  page,
  request,
}) => {
  await putLayout(request, { ungroupedIds: ['1002', '1003'] }); // web, docs

  await page.goto('/');
  await expect(page.locator('[data-stat="repositories"]')).toHaveText('2');
  await expect(page.locator('[data-stat="pull-requests"]')).toHaveText('1');
  await expect(page.locator('[data-stat="failing"]')).toHaveText('0');
  await expect(page.getByTestId('scope-note')).toContainText(
    '2 followed of 4 available',
  );
  await expect(page.getByTestId('attention')).toHaveCount(0);

  await page.goto('/repositories');
  await expect(page.getByTestId('repository-card')).toHaveCount(2);
  await expect(
    page.getByTestId('repository-card').filter({ hasText: 'e2e-org/api' }),
  ).toHaveCount(0);

  await page.goto('/pull-requests');
  await expect(page.getByTestId('pr-list').locator('[data-pr]')).toHaveCount(1);
  await page.goto('/activity');
  await expect(page.locator('[data-event="repository.ci.failed"]')).toHaveCount(
    0,
  );
  await expect(page.locator('[data-event="repository.ci.passed"]')).toHaveCount(
    1,
  );

  // A direct link still works for a repository that is not followed.
  await page.goto('/repositories/1001');
  await expect(
    page.getByRole('heading', { level: 1, name: 'e2e-org/api' }),
  ).toBeVisible();
});

test('with nothing followed the app explains it instead of reporting no repositories', async ({
  page,
  request,
}) => {
  await putLayout(request, { ungroupedIds: [] });
  await page.goto('/');
  await expect(page.getByTestId('not-following')).toContainText('4 available');
  await page.goto('/repositories');
  await expect(page.getByTestId('onboarding')).toBeVisible();
  await expect(page.getByText('No repositories yet')).toHaveCount(0);
});

test('Manage repositories: search, select, save, and it survives a reload', async ({
  page,
  request,
}) => {
  await putLayout(request, { ungroupedIds: [] });
  await page.goto('/repositories');
  await page.getByTestId('select-repositories').click();

  const manage = page.getByTestId('manage-repositories');
  await manage.getByTestId('manage-search').fill('billing');
  await expect(manage.getByTestId('manage-list').locator('li')).toHaveCount(1);
  await manage.getByTestId('manage-list').getByRole('checkbox').check();
  await manage.getByTestId('manage-search').fill('');
  await manage.locator('input[data-repo="e2e-org/web"]').check();
  await expect(manage.getByTestId('selected-count')).toHaveText('2');
  await manage.getByTestId('manage-save').click();

  await expect(page.getByTestId('notice')).toContainText(
    'Following 2 repositories',
  );
  await expect(page.getByTestId('repository-card')).toHaveCount(2);

  await page.reload();
  await expect(page.getByTestId('repository-card')).toHaveCount(2);
  await expect(page.getByTestId('follow-summary')).toContainText(
    '2 followed of 4 available',
  );
});

test('Edit dashboard: reorder, group, move, unfollow and restore with the buttons; save; reload', async ({
  page,
}) => {
  await page.goto('/repositories');
  await expect(page.getByTestId('repository-card')).toHaveCount(4);

  await page.getByTestId('edit-dashboard').click();
  // Cards are not links while editing, so clicking one cannot navigate.
  await expect(
    page
      .getByTestId('item-1001')
      .getByRole('link', { name: 'e2e-org/api', exact: true }),
  ).toHaveCount(0);

  // Reorder: move api down one place.
  await page.getByTestId('item-1001').getByTestId('move-down').click();
  expect(
    await page
      .locator('[data-dnd-item]')
      .evaluateAll((e) => e.map((x) => x.getAttribute('data-item-id'))),
  ).toEqual(['1003', '1001', '1004', '1002']);

  // Create a group and move web into it.
  await page.getByTestId('new-group-name').fill('Production');
  await page.getByTestId('add-group').click();
  await expect(page.getByTestId('group-name')).toHaveValue('Production');
  await page
    .getByTestId('item-1002')
    .getByTestId('move-to')
    .selectOption({ label: 'Production' });
  await expect(
    page.getByTestId('zone-ungrouped').locator('[data-dnd-item]'),
  ).toHaveCount(3);

  // Unfollow legacy from its card, then restore it from the hidden tray.
  await page.getByTestId('item-1004').getByTestId('hide').click();
  await expect(page.getByTestId('item-1004')).toHaveCount(0);
  await expect(page.getByTestId('hidden-tray')).toContainText('e2e-org/legacy');
  await page.getByTestId('restore').click();
  await expect(page.getByTestId('item-1004')).toBeVisible();

  // Cancel throws all of it away.
  await page.getByTestId('cancel-layout').click();
  await expect(page.getByText('Production')).toHaveCount(0);

  await page.getByTestId('edit-dashboard').click();
  await page.getByTestId('item-1001').getByTestId('move-down').click();
  await page.getByTestId('new-group-name').fill('Production');
  await page.getByTestId('add-group').click();
  await page
    .getByTestId('item-1002')
    .getByTestId('move-to')
    .selectOption({ label: 'Production' });
  await page.getByTestId('item-1004').getByTestId('pin').click();
  await page.getByTestId('save-layout').click();
  await expect(page.getByTestId('notice')).toContainText('Dashboard saved');

  await page.reload();
  const production = page.getByTestId(
    'section-' +
      (await page
        .locator('[data-testid^="section-"]')
        .evaluateAll(
          (s) =>
            s
              .map((x) =>
                x.getAttribute('data-testid')!.replace('section-', ''),
              )
              .find((id) => id !== 'ungrouped')!,
        )),
  );
  await expect(production).toContainText('Production');
  await expect(production).toContainText('e2e-org/web');
  const order = await page
    .getByTestId('zone-ungrouped')
    .locator('[data-dnd-item]')
    .evaluateAll((e) => e.map((x) => x.getAttribute('data-item-id')));
  expect(order).toEqual(['1004', '1003', '1001']); // legacy pinned first, then docs, api
});

test('Edit dashboard: pointer drag-and-drop moves a card between groups', async ({
  page,
  request,
}) => {
  await putLayout(request, {
    groups: [{ id: 'dnd-target', name: 'Targets', itemIds: [] }],
    ungroupedIds: ALL,
  });
  await page.goto('/repositories');
  await page.getByTestId('edit-dashboard').click();

  const card = page.getByTestId('item-1002');
  const zone = page.getByTestId('zone-dnd-target');
  await expect(zone.getByTestId('empty-group')).toBeVisible();
  await card.dragTo(zone);

  await expect(zone.locator('[data-item-id="1002"]')).toHaveCount(1);
  await page.getByTestId('save-layout').click();
  await expect(page.getByTestId('notice')).toContainText('Dashboard saved');
  await page.reload();
  await expect(
    page.getByTestId('zone-dnd-target').locator('[data-item-id="1002"]'),
  ).toHaveCount(1);
});

test('Edit dashboard: restoring the default layout drops groups but keeps what is followed', async ({
  page,
  request,
}) => {
  await putLayout(request, {
    groups: [{ id: 'g-old', name: 'Old', itemIds: ['1001'] }],
    ungroupedIds: ['1003', '1004', '1002'],
  });
  await page.goto('/repositories');
  await expect(page.getByTestId('section-g-old')).toBeVisible();
  await page.getByTestId('edit-dashboard').click();
  await page.getByTestId('reset-layout').click();
  await page.getByTestId('reset-layout').click(); // confirm
  await expect(page.getByTestId('notice')).toContainText(
    'Default layout restored',
  );
  await expect(page.getByTestId('section-g-old')).toHaveCount(0);
  await expect(page.getByTestId('repository-card')).toHaveCount(4);
});

test('the layout API rejects bad input and unauthenticated requests', async ({
  request,
  playwright,
  baseURL,
}) => {
  const bad = await request.put('/api/v1/dashboard-layout', {
    data: {
      groups: [],
      ungroupedIds: ['999999'],
      hiddenIds: [],
      pinnedIds: [],
    },
    headers: { origin: 'http://localhost:4400' },
  });
  expect(bad.status()).toBe(400);
  const hidden = await request.put('/api/v1/dashboard-layout', {
    data: { groups: [], ungroupedIds: [], hiddenIds: ['1001'], pinnedIds: [] },
    headers: { origin: 'http://localhost:4400' },
  });
  expect(hidden.status()).toBe(400);
  const crossOrigin = await request.put('/api/v1/dashboard-layout', {
    data: { groups: [], ungroupedIds: ALL, hiddenIds: [], pinnedIds: [] },
    headers: { origin: 'https://evil.example' },
  });
  expect(crossOrigin.status()).toBe(403);

  const anonymous = await playwright.request.newContext({ baseURL });
  expect((await anonymous.get('/api/v1/dashboard-layout')).status()).toBe(401);
  expect(
    (
      await anonymous.put('/api/v1/dashboard-layout', {
        data: {},
        headers: { origin: 'http://localhost:4400' },
      })
    ).status(),
  ).toBe(401);
  await anonymous.dispose();
});
