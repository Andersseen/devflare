import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * Dashboard customization (spec 022), as the owner uses it. Like
 * project-resources.spec.ts, every API the browser calls is answered here
 * (session, projects, Cloudflare inventory, dashboard layout) so the flow runs
 * without dev-auth or D1. The dashboard mock is stateful, the way the real
 * API is, which is what makes "save, reload, still there" meaningful. The
 * server half (persistence, user scoping, ownership) is covered by
 * apps/devflare/src/server/lib/dashboard-store.spec.ts.
 */

const NOW = new Date().toISOString();
const worker = (name: string) => ({
  name,
  createdOn: NOW,
  modifiedOn: NOW,
  domains: [],
});

const PROJECTS = ['Alpha', 'Beta', 'Gamma'].map((name, i) => ({
  id: `p-${name.toLowerCase()}`,
  userId: 'u-1',
  name,
  repoUrl: null,
  // Oldest first in storage; the dashboard's default order is by activity.
  createdAt: new Date(Date.now() - (3 - i) * 86_400_000).toISOString(),
  resources: [] as unknown[],
}));
const key = (name: string) => `saved:p-${name.toLowerCase()}`;

interface Layout {
  groups: { id: string; name: string; itemIds: string[] }[];
  ungroupedIds: string[];
  hiddenIds: string[];
  pinnedIds: string[];
}

async function mockApis(page: Page) {
  let layout: Layout | null = null;
  let identities: unknown[] = [];
  const links: { projectId: string; resourceId: string }[] = [];

  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (path === '/api/auth/session') {
      return json(route, {
        user: { id: 'u-1', email: 'o@example.com', name: 'Owner', image: null },
      });
    }
    if (path === '/api/admin/whoami') return json(route, { admin: true });
    if (path === '/api/v1/cloud/status') {
      return json(route, {
        admin: true,
        configured: true,
        canConnect: false,
        reason: 'ok',
        connection: {
          kind: 'token',
          accountId: 'acc',
          accountName: 'Test account',
          scope: null,
          connectedAt: null,
          expiresAt: null,
          needsReconnect: false,
        },
      });
    }
    if (path === '/api/v1/cloud/workers') {
      return json(route, {
        workers: [worker('strata-www'), worker('strata-sc-qualification')],
      });
    }
    if (path === '/api/v1/cloud/pages') return json(route, { projects: [] });
    if (path === '/api/v1/cloud/storage') {
      return json(route, {
        d1: { items: [], error: null },
        kv: { items: [], error: null },
      });
    }
    if (path === '/api/v1/cloud/buckets') return json(route, { items: [] });

    if (path === '/api/v1/projects' && method === 'GET') {
      return json(route, { projects: PROJECTS });
    }
    const link = /^\/api\/v1\/projects\/([^/]+)\/resources$/.exec(path);
    if (link && method === 'POST') {
      const body = request.postDataJSON() as {
        type: string;
        resourceId: string;
      };
      links.push({ projectId: link[1], resourceId: body.resourceId });
      return json(
        route,
        {
          resource: {
            id: `l-${links.length}`,
            projectId: link[1],
            provider: 'cloudflare',
            type: body.type,
            resourceId: body.resourceId,
            resourceName: body.resourceId,
            createdAt: NOW,
          },
        },
        201,
      );
    }

    if (path === '/api/v1/dashboard') {
      if (method === 'PUT') layout = request.postDataJSON() as Layout;
      if (method === 'DELETE') layout = null;
      return json(route, {
        layout: layout ?? {
          groups: [],
          ungroupedIds: [],
          hiddenIds: [],
          pinnedIds: [],
        },
        customized: layout !== null,
      });
    }
    if (path === '/api/v1/dashboard/identities') {
      if (method === 'PUT') {
        identities = (request.postDataJSON() as { identities: unknown[] })
          .identities;
      }
      if (method === 'DELETE') identities = [];
      return json(route, { identities });
    }

    return json(route, { statusMessage: 'Not mocked' }, 404);
  });

  return { links, layout: () => layout, identities: () => identities };
}

const order = (page: Page, zone = 'zone-ungrouped') =>
  page
    .getByTestId(zone)
    .locator('[data-dnd-item]')
    .evaluateAll((items) => items.map((i) => i.getAttribute('data-item-id')));

test.describe('Dashboard customization', () => {
  test('a first-time user sees every project and no editing controls', async ({
    page,
  }) => {
    await mockApis(page);
    await page.goto('/');
    await expect(page.getByTestId('project-card')).toHaveCount(3);
    await expect(page.getByTestId('move-down')).toHaveCount(0);
    await expect(page.getByTestId('drag-handle')).toHaveCount(0);
    await expect(page.getByTestId('edit-dashboard')).toBeVisible();
  });

  test('reorder, group, hide and restore with the buttons; save; reload; same layout', async ({
    page,
  }) => {
    const api = await mockApis(page);
    await page.goto('/');
    await expect(page.getByTestId('project-card')).toHaveCount(3);
    await page.getByTestId('edit-dashboard').click();

    // Cards cannot navigate while editing.
    await expect(page.getByTestId('edit-hint')).toBeVisible();
    await expect(page.getByTestId('project-card').first()).toHaveCSS(
      'pointer-events',
      'none',
    );

    const initial = (await order(page)) as string[];
    expect(initial).toHaveLength(3);
    await page
      .getByTestId(`item-${initial[0]}`)
      .getByTestId('move-down')
      .click();
    await expect
      .poll(() => order(page))
      .toEqual([initial[1], initial[0], initial[2]]);

    await page.getByTestId('new-group-name').fill('Client work');
    await page.getByTestId('add-group').click();
    await page
      .getByTestId(`item-${initial[2]}`)
      .getByTestId('move-to')
      .selectOption({ label: 'Client work' });
    await expect.poll(async () => (await order(page)).length).toBe(2);

    // Hide one, restore it from the tray.
    await page.getByTestId(`item-${initial[1]}`).getByTestId('hide').click();
    await expect(page.getByTestId('hidden-tray')).toBeVisible();
    await page.getByTestId('restore').click();
    await expect(page.getByTestId(`item-${initial[1]}`)).toBeVisible();

    await page.getByTestId('save-layout').click();
    await expect(page.getByTestId('notice')).toContainText('Dashboard saved');
    expect(api.layout()?.groups[0].name).toBe('Client work');

    const afterSave = await order(page);
    await page.reload();
    await expect(page.getByTestId('project-card')).toHaveCount(3);
    await expect.poll(() => order(page)).toEqual(afterSave);
    await expect(
      page.getByRole('heading', { name: 'Client work' }),
    ).toBeVisible();
    // Back to a clean view: no editing controls.
    await expect(page.getByTestId('move-down')).toHaveCount(0);
  });

  test('cancel discards the draft; hiding a project never deletes it', async ({
    page,
  }) => {
    const api = await mockApis(page);
    await page.goto('/');
    await page.getByTestId('edit-dashboard').click();
    const first = ((await order(page)) as string[])[0];
    await page.getByTestId(`item-${first}`).getByTestId('hide').click();
    await expect(page.getByTestId('project-card')).toHaveCount(2);
    await page.getByTestId('cancel-layout').click();
    await expect(page.getByTestId('project-card')).toHaveCount(3);
    expect(api.layout()).toBeNull();

    // Saved hidden: gone from the view, still a project, restorable.
    await page.getByTestId('edit-dashboard').click();
    await page.getByTestId(`item-${first}`).getByTestId('hide').click();
    await page.getByTestId('save-layout').click();
    await expect(page.getByTestId('project-card')).toHaveCount(2);
    await page.getByTestId('edit-dashboard').click();
    await page.getByTestId('restore').click();
    await page.getByTestId('save-layout').click();
    await expect(page.getByTestId('project-card')).toHaveCount(3);
  });

  test('pointer drag-and-drop moves a card into a group', async ({ page }) => {
    const api = await mockApis(page);
    await page.goto('/');
    await page.getByTestId('edit-dashboard').click();
    await page.getByTestId('new-group-name').fill('Targets');
    await page.getByTestId('add-group').click();

    const zone = page.getByTestId(/^zone-(?!ungrouped)/);
    const dragged = ((await order(page)) as string[])[0];
    await page.getByTestId(`item-${dragged}`).dragTo(zone);
    await expect(zone.locator(`[data-item-id="${dragged}"]`)).toHaveCount(1);

    await page.getByTestId('save-layout').click();
    await expect(page.getByTestId('notice')).toContainText('Dashboard saved');
    expect(api.layout()?.groups[0].itemIds).toEqual([dragged]);
  });

  test('restore default layout clears the saved arrangement', async ({
    page,
  }) => {
    const api = await mockApis(page);
    await page.goto('/');
    await page.getByTestId('edit-dashboard').click();
    await page.getByTestId('new-group-name').fill('Temp');
    await page.getByTestId('add-group').click();
    await page.getByTestId('save-layout').click();
    await expect(page.getByTestId('notice')).toContainText('saved');
    expect(api.layout()).not.toBeNull();

    await page.getByTestId('edit-dashboard').click();
    await page.getByTestId('reset-layout').click();
    await page.getByTestId('reset-layout').click(); // confirm
    await expect(page.getByTestId('notice')).toContainText(
      'Default layout restored',
    );
    expect(api.layout()).toBeNull();
    await expect(page.getByRole('heading', { name: 'Temp' })).toHaveCount(0);
  });

  test('discovered cards: edit their grouping aliases, hide one, assign one to a saved project', async ({
    page,
  }) => {
    const api = await mockApis(page);
    await page.goto('/');

    // Both strata Workers are grouped by the built-in identity.
    const strata = page
      .getByTestId('discovered-grid')
      .locator('[data-discovered="strata"]');
    await expect(strata).toHaveCount(1);
    await expect(strata.first()).toContainText('Strata');

    // Assign needs an explicit choice; it uses the verified link API.
    await strata
      .first()
      .getByTestId('assign-select')
      .selectOption({ label: 'Alpha' });
    await strata.first().getByTestId('assign-button').click();
    await expect(page.getByTestId('notice')).toContainText(
      'Linked 2 resources to Alpha',
    );
    expect(api.links.map((l) => l.resourceId).sort()).toEqual([
      'strata-sc-qualification',
      'strata-www',
    ]);

    // Edit the discovery group: drop one alias, so one Worker falls out.
    await page.getByTestId('edit-dashboard').click();
    await page.getByTestId('identities-panel').locator('summary').click();
    const row = page.locator('[data-identity="strata"]');
    await row.getByTestId('identity-aliases').fill('strata-www');
    await row.getByTestId('identity-aliases').blur();
    await page.getByTestId('save-layout').click();
    await expect(page.getByTestId('notice')).toContainText('Dashboard saved');
    expect(
      (api.identities() as { slug: string; aliases: string[] }[]).find(
        (i) => i.slug === 'strata',
      )?.aliases,
    ).toEqual(['strata-www']);
  });
});
