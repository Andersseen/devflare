import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * Project resources (spec 019), as the owner uses them: open a project, link a
 * resource, see it counted on the dashboard, unlink it again.
 *
 * Every API the browser calls is answered here — the signed-in session, the
 * projects API and the Cloudflare inventory — so the flow runs without
 * dev-auth, without D1 state and without touching a real Cloudflare account.
 * The mock is stateful for projects, the way the real API is: a link made on
 * one page is what the next page reads. The server half (verification,
 * ownership, conflicts) is covered by apps/devflare/src/server/lib/*.spec.ts.
 */

interface MockResource {
  id: string;
  projectId: string;
  provider: 'cloudflare';
  type: string;
  resourceId: string;
  resourceName: string;
  createdAt: string;
}

const NOW = new Date().toISOString();

function worker(name: string) {
  return { name, createdOn: NOW, modifiedOn: NOW, domains: [] };
}

const INVENTORY = {
  workers: [worker('ally-api'), worker('ally-runner')],
  pages: [
    {
      name: 'ally-web',
      subdomain: 'ally-web.pages.dev',
      domains: ['ally.andersseen.dev'],
      productionBranch: 'main',
      createdOn: NOW,
      repo: null,
      gitConnected: false,
      latestDeployment: null,
    },
  ],
  storage: {
    d1: {
      items: [
        {
          id: 'd1-uuid',
          name: 'ally-db',
          createdAt: NOW,
          sizeBytes: 4096,
          tables: null,
        },
      ],
      error: null,
    },
    kv: { items: [{ id: 'kv-id', name: 'ally-cache' }], error: null },
  },
};

async function mockApis(page: Page, options: { r2Forbidden?: boolean } = {}) {
  const projects = [
    {
      id: 'p-ally',
      userId: 'u-1',
      name: 'Ally',
      repoUrl: 'https://github.com/andersseen/ally',
      createdAt: NOW,
      resources: [] as MockResource[],
    },
  ];
  let linkSeq = 0;

  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (path === '/api/auth/session') {
      return json(route, {
        user: {
          id: 'u-1',
          email: 'owner@example.com',
          name: 'Owner',
          image: null,
        },
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
      return json(route, { workers: INVENTORY.workers });
    }
    if (path === '/api/v1/cloud/pages') {
      return json(route, { projects: INVENTORY.pages });
    }
    if (path.startsWith('/api/v1/cloud/pages/')) {
      return json(route, { project: INVENTORY.pages[0], deployments: [] });
    }
    if (path === '/api/v1/cloud/storage') return json(route, INVENTORY.storage);
    if (path === '/api/v1/cloud/buckets') {
      return options.r2Forbidden
        ? json(
            route,
            {
              statusMessage:
                'Insufficient permissions (Cloudflare error 10000)',
              data: {
                error: 'Insufficient permissions (Cloudflare error 10000)',
              },
            },
            403,
          )
        : json(route, {
            items: [{ name: 'ally-reports', createdAt: NOW, location: null }],
          });
    }

    if (path === '/api/v1/projects' && method === 'GET') {
      return json(route, { projects });
    }

    const resources =
      /^\/api\/v1\/projects\/([^/]+)\/resources(?:\/([^/]+))?$/.exec(path);
    if (resources) {
      const project = projects.find(
        (candidate) => candidate.id === resources[1],
      );
      if (!project)
        return json(route, { statusMessage: 'Project not found' }, 404);

      if (method === 'POST') {
        const body = request.postDataJSON() as {
          type: string;
          resourceId: string;
        };
        linkSeq += 1;
        const link: MockResource = {
          id: `link-${linkSeq}`,
          projectId: project.id,
          provider: 'cloudflare',
          type: body.type,
          resourceId: body.resourceId,
          resourceName: body.resourceId,
          createdAt: NOW,
        };
        project.resources.push(link);
        return json(route, { resource: link }, 201);
      }
      if (method === 'DELETE' && resources[2]) {
        project.resources = project.resources.filter(
          (link) => link.id !== resources[2],
        );
        return json(route, { success: true });
      }
      return json(route, { resources: project.resources });
    }

    return json(route, { statusMessage: 'Not mocked' }, 404);
  });
}

function projectCard(page: Page, name: string) {
  return page
    .getByTestId('project-card')
    .filter({ has: page.getByRole('heading', { name }) });
}

test.describe('Project resources', () => {
  test('link a Worker, see it counted, unlink it', async ({ page }) => {
    await mockApis(page);

    // The project exists, owning nothing yet.
    await page.goto('/');
    const card = projectCard(page, 'Ally');
    await expect(card).toBeVisible();
    await expect(card.getByTestId('resource-counts')).toHaveText(
      'No resources linked',
    );

    // Open it and link a Worker through the keyboard-accessible checklist.
    await card.click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Ally' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Link resource' }).click();

    const panel = page.getByRole('form', { name: 'Link Cloudflare resources' });
    await expect(panel.getByRole('group', { name: 'Compute' })).toBeVisible();
    await panel.getByRole('checkbox', { name: 'ally-api' }).check();
    await panel.getByRole('button', { name: 'Link resource' }).click();

    const resource = page
      .getByTestId('project-resource')
      .filter({ hasText: 'ally-api' });
    await expect(resource).toBeVisible();
    await expect(resource).toHaveAttribute('data-resource-state', 'available');
    await expect(page.getByRole('status')).toContainText('Linked ally-api');

    // The dashboard counts it.
    await page.getByRole('link', { name: 'All projects' }).click();
    await expect(
      projectCard(page, 'Ally').getByTestId('resource-counts'),
    ).toHaveText('1 Worker');

    // Back to the project, and unlink.
    await projectCard(page, 'Ally').click();
    await page.getByRole('button', { name: 'Unlink ally-api' }).click();
    await expect(page.getByTestId('project-resource')).toHaveCount(0);
    await expect(page.getByText('No resources linked yet.')).toBeVisible();
  });

  test('links several kinds at once and summarises them on the card', async ({
    page,
  }) => {
    await mockApis(page);
    await page.goto('/');
    await projectCard(page, 'Ally').click();
    await page.getByRole('button', { name: 'Link resource' }).click();

    const panel = page.getByRole('form', { name: 'Link Cloudflare resources' });
    for (const name of [
      'ally-web',
      'ally-api',
      'ally-runner',
      'ally-db',
      'ally-reports',
    ]) {
      await panel.getByRole('checkbox', { name }).check();
    }
    await panel.getByRole('button', { name: 'Link 5 resources' }).click();
    await expect(page.getByTestId('project-resource')).toHaveCount(5);

    await page.getByRole('link', { name: 'All projects' }).click();
    await expect(
      projectCard(page, 'Ally').getByTestId('resource-counts'),
    ).toHaveText(/1 Pages · 2 Workers\s*1 D1 · 1 R2/);
  });

  test('an unreadable product reads as unavailable, not as empty', async ({
    page,
  }) => {
    await mockApis(page, { r2Forbidden: true });
    await page.goto('/');
    await projectCard(page, 'Ally').click();
    await page.getByRole('button', { name: 'Link resource' }).click();

    await expect(page.getByTestId('link-section-unavailable')).toContainText(
      'R2 unavailable',
    );
    await expect(page.getByTestId('link-section-unavailable')).toContainText(
      'Insufficient permissions',
    );
  });
});
