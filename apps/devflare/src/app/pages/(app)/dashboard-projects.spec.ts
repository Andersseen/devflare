import { describe, expect, it } from 'vitest';
import type {
  CloudDeployment,
  CloudInventory,
  CloudPagesProject,
  CloudWorker,
  Project,
  ProjectResource,
} from '@org/core';
import {
  buildProjectViews,
  findProjectView,
  latestDeployment,
  resourceUrl,
  resourceUrls,
  unresolvedCount,
} from './dashboard-projects';

function worker(name: string): CloudWorker {
  return {
    name,
    createdOn: '2026-08-01T00:00:00.000Z',
    modifiedOn: '2026-08-24T00:00:00.000Z',
    domains: [],
  };
}

function pages(name: string): CloudPagesProject {
  return {
    name,
    subdomain: `${name}.pages.dev`,
    domains: [],
    productionBranch: 'main',
    createdOn: '2026-08-01T00:00:00.000Z',
    repo: null,
    gitConnected: false,
    latestDeployment: null,
  };
}

function inventory(input: {
  pages?: CloudPagesProject[];
  workers?: CloudWorker[];
  r2?: string[];
  r2Error?: string;
}): CloudInventory {
  return {
    worker: { items: input.workers ?? [], error: null },
    pages: { items: input.pages ?? [], error: null },
    d1: { items: [], error: null },
    kv: { items: [], error: null },
    r2: {
      items: (input.r2 ?? []).map((name) => ({
        name,
        createdAt: '',
        location: null,
      })),
      error: input.r2Error ?? null,
    },
  };
}

let linkId = 0;
function link(
  projectId: string,
  type: ProjectResource['type'],
  resourceId: string,
): ProjectResource {
  linkId += 1;
  return {
    id: `link-${linkId}`,
    projectId,
    provider: 'cloudflare',
    type,
    resourceId,
    resourceName: resourceId,
    createdAt: '2026-09-01T00:00:00.000Z',
  };
}

function saved(
  id: string,
  name: string,
  resources: ProjectResource[] = [],
  createdAt = '2026-08-01T00:00:00.000Z',
): Project {
  return {
    id,
    userId: 'user-1',
    name,
    repoUrl: null,
    createdAt,
    resources,
  };
}

function build(input: {
  saved?: Project[];
  pages?: CloudPagesProject[];
  workers?: CloudWorker[];
  r2?: string[];
  r2Error?: string;
}) {
  return buildProjectViews({
    saved: input.saved ?? [],
    inventory: inventory(input),
  });
}

describe('saved projects (explicit ownership)', () => {
  it('owns exactly its linked resources, several Workers included', () => {
    const { projects } = build({
      saved: [
        saved('ally', 'Ally', [
          link('ally', 'worker', 'ally-api'),
          link('ally', 'worker', 'ally-runner'),
          link('ally', 'pages', 'ally-web'),
          link('ally', 'r2', 'ally-reports'),
        ]),
      ],
      pages: [pages('ally-web')],
      workers: [worker('ally-api'), worker('ally-runner')],
      r2: ['ally-reports'],
    });

    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({ kind: 'saved', slug: 'ally' });
    expect(projects[0].resources.map((r) => [r.type, r.name, r.state])).toEqual(
      [
        ['pages', 'ally-web', 'available'],
        ['worker', 'ally-api', 'available'],
        ['worker', 'ally-runner', 'available'],
        ['r2', 'ally-reports', 'available'],
      ],
    );
    expect(projects[0].workers.map((w) => w.name)).toEqual([
      'ally-api',
      'ally-runner',
    ]);
  });

  it('lists a project with no resources — ownership, not Cloudflare, makes it a project', () => {
    const { projects } = build({ saved: [saved('p', 'Portfolio')] });
    expect(projects.map((p) => p.name)).toEqual(['Portfolio']);
    expect(projects[0].resources).toEqual([]);
  });

  it('keeps a link whose resource vanished, marked missing', () => {
    const { projects } = build({
      saved: [saved('ally', 'Ally', [link('ally', 'worker', 'ally-api')])],
      workers: [],
    });
    expect(projects[0].resources[0]).toMatchObject({
      name: 'ally-api',
      state: 'missing',
    });
    expect(unresolvedCount(projects[0])).toBe(1);
  });

  it('keeps a link whose product cannot be read, marked unverifiable', () => {
    const { projects } = build({
      saved: [saved('ally', 'Ally', [link('ally', 'r2', 'ally-reports')])],
      r2Error: 'Insufficient permissions',
    });
    expect(projects[0].resources[0]).toMatchObject({
      state: 'unverifiable',
      reason: 'Insufficient permissions',
    });
  });

  it('marks every link unverifiable when there is no inventory at all', () => {
    const { projects, discovered } = buildProjectViews({
      saved: [saved('ally', 'Ally', [link('ally', 'worker', 'ally-api')])],
      inventory: null,
      unavailable: 'Cloudflare is not connected',
    });
    expect(projects[0].resources[0]).toMatchObject({
      state: 'unverifiable',
      reason: 'Cloudflare is not connected',
    });
    expect(discovered.every((view) => !view.resources.length)).toBe(true);
  });

  it('gives saved projects distinct slugs even with the same name', () => {
    const { projects } = build({
      saved: [
        saved('aaaaaaaa-1', 'Ally', [], '2026-08-01T00:00:00.000Z'),
        saved('bbbbbbbb-2', 'Ally', [], '2026-08-02T00:00:00.000Z'),
      ],
    });
    expect(new Set(projects.map((p) => p.slug)).size).toBe(2);
    expect(projects.map((p) => p.slug)).toContain('ally');
  });
});

describe('explicit ownership over heuristics', () => {
  it('lets a link win over a name match', () => {
    // "devflare" would match the watched DevFlare group by name; the link says
    // it belongs to Production app, and the link wins.
    const views = build({
      saved: [
        saved('prod', 'Production app', [link('prod', 'worker', 'devflare')]),
      ],
      workers: [worker('devflare'), worker('dev-auth-prod')],
    });

    expect(views.projects[0].workers.map((w) => w.name)).toEqual(['devflare']);
    const devflare = views.discovered.find((view) => view.slug === 'devflare');
    expect(devflare?.workers.map((w) => w.name)).toEqual(['dev-auth-prod']);
  });

  it('only suggests unowned look-alikes to a saved project — never links them', () => {
    const { projects, discovered } = build({
      saved: [saved('ally', 'Ally', [link('ally', 'pages', 'ally-web')])],
      pages: [pages('ally-web')],
      workers: [worker('ally-audit-worker')],
      r2: ['ally-reports'],
    });

    expect(projects[0].resources.map((r) => r.name)).toEqual(['ally-web']);
    expect(projects[0].suggestions.map((s) => [s.type, s.name])).toEqual([
      ['worker', 'ally-audit-worker'],
      ['r2', 'ally-reports'],
    ]);
    // Suggested to Ally, so not also offered as its own discovered project.
    expect(discovered.some((view) => view.name === 'ally-audit-worker')).toBe(
      false,
    );
  });

  it('uses watched aliases to suggest for a saved project that is a watched one', () => {
    const { projects } = build({
      saved: [saved('df', 'DevFlare')],
      workers: [worker('dev-auth-prod'), worker('unrelated')],
    });
    expect(projects[0].suggestions.map((s) => s.name)).toEqual([
      'dev-auth-prod',
    ]);
  });

  it('never suggests a resource another project owns', () => {
    const { projects } = build({
      saved: [
        saved('ally', 'Ally'),
        saved('audit', 'Audit', [link('audit', 'worker', 'ally-audit')]),
      ],
      workers: [worker('ally-audit')],
    });
    const ally = projects.find((p) => p.name === 'Ally');
    expect(ally?.suggestions).toEqual([]);
  });
});

describe('discovered projects (heuristic, unsaved)', () => {
  it('groups DevFlare resources under one discovered project', () => {
    const { discovered } = build({
      pages: [pages('volt-ui')],
      workers: [
        worker('devflare'),
        worker('dev-auth-prod'),
        worker('dev-auth-staging'),
        worker('worker-devflare-hono'),
        worker('control-bucket'),
      ],
    });
    const devflare = discovered.find((view) => view.slug === 'devflare');

    expect(devflare?.kind).toBe('discovered');
    expect(devflare?.project).toBeNull();
    expect(devflare?.workers.map((item) => item.name).sort()).toEqual([
      'control-bucket',
      'dev-auth-prod',
      'dev-auth-staging',
      'devflare',
      'worker-devflare-hono',
    ]);
    expect(
      devflare?.resources.every(
        (r) => r.link === null && r.state === 'available',
      ),
    ).toBe(true);
  });

  it('keeps verified route-only domains live', () => {
    const { discovered } = build({});
    expect(
      discovered
        .filter((view) => view.verifiedUrls.length)
        .map((view) => view.slug)
        .sort(),
    ).toEqual(['angular-movement', 'lumen-icons', 'volt-ui']);
  });

  it('drops a route-only placeholder once a saved project represents it', () => {
    const { discovered, projects } = build({ saved: [saved('v', 'Volt UI')] });
    expect(discovered.some((view) => view.slug === 'volt-ui')).toBe(false);
    expect(projects[0].verifiedUrls).toEqual([
      'https://volt-ui.andersseen.dev',
    ]);
  });

  it('integrates the andersseen.dev Pages project under Andersseen Dev', () => {
    const { discovered } = build({
      pages: [
        {
          ...pages('my-blog'),
          domains: ['my-blog-6vo.pages.dev', 'andersseen.dev'],
        },
      ],
    });
    expect(
      discovered.find((view) => view.slug === 'andersseen-dev'),
    ).toMatchObject({
      url: 'https://andersseen.dev',
      pages: [{ name: 'my-blog' }],
    });
  });

  it('does not turn a lone bucket into a project', () => {
    const { discovered } = build({ r2: ['random-bucket'] });
    expect(discovered.some((view) => view.name === 'random-bucket')).toBe(
      false,
    );
  });

  it('places every Worker and Pages project exactly once', () => {
    const pageNames = [
      'and-web-components-docs',
      'etyma-www',
      'my-blog',
      'forge-cms',
      'forge-cms-demo',
    ];
    const workerNames = [
      'ally-audit-worker',
      'cv-builder',
      'dev-auth-prod',
      'devflare',
      'imageryx-api-worker',
      'todo-reminder-cron',
    ];
    const views = build({
      saved: [
        saved('cv', 'CV Builder', [link('cv', 'worker', 'cv-builder')]),
        saved('prod', 'Production app', [link('prod', 'worker', 'devflare')]),
      ],
      pages: pageNames.map(pages),
      workers: workerNames.map(worker),
    });
    const all = [...views.projects, ...views.discovered];
    const placed = [
      ...all.flatMap((view) => view.resources.map((r) => r.name)),
      ...views.projects.flatMap((view) => view.suggestions.map((r) => r.name)),
    ];

    expect(placed.sort()).toEqual([...pageNames, ...workerNames].sort());
  });

  it('finds a view by slug, saved before discovered', () => {
    const views = build({
      saved: [saved('a', 'Ally')],
      workers: [worker('todo-reminder-cron')],
    });
    expect(findProjectView('ally', views)?.kind).toBe('saved');
    expect(findProjectView('todo-reminder-cron', views)?.kind).toBe(
      'discovered',
    );
    expect(findProjectView('nope', views)).toBeNull();
  });
});

describe('resource URLs', () => {
  it('prefers a Pages custom domain but retains the Pages fallback', () => {
    const project = {
      ...pages('my-blog'),
      domains: ['my-blog.pages.dev', 'andersseen.dev'],
    };

    expect(resourceUrls(project, null)).toEqual([
      'https://andersseen.dev',
      'https://my-blog.pages.dev',
    ]);
    expect(resourceUrl(project, null)).toBe('https://andersseen.dev');
  });

  it('removes repeated domains and preserves a default-only Pages URL', () => {
    const project = {
      ...pages('demo'),
      domains: ['demo.pages.dev', 'demo.pages.dev'],
    };

    expect(resourceUrls(project, null)).toEqual(['https://demo.pages.dev']);
  });

  it('falls back to the explicit Pages subdomain when domains is empty', () => {
    const project = pages('empty-domains');

    expect(resourceUrls(project, null)).toEqual([
      'https://empty-domains.pages.dev',
    ]);
    expect(resourceUrl(project, null)).toBe('https://empty-domains.pages.dev');
  });
});

function deployment(id: string, createdOn: string): CloudDeployment {
  return {
    id,
    shortId: id.slice(0, 8),
    url: `https://${id}.demo.pages.dev`,
    environment: 'production',
    createdOn,
    trigger: 'github:push',
    status: 'success',
    stage: 'deploy',
    branch: 'main',
    commit: 'abcdef1234',
    commitMessage: null,
  };
}

describe('latestDeployment', () => {
  it('picks the newest Pages deployment across a project', () => {
    const older = {
      ...pages('docs'),
      latestDeployment: deployment('old', '2026-09-01T00:00:00.000Z'),
    };
    const newer = {
      ...pages('site'),
      latestDeployment: deployment('new', '2026-09-20T00:00:00.000Z'),
    };

    expect(latestDeployment([older, newer, pages('empty')])).toEqual({
      pagesProject: 'site',
      deployment: newer.latestDeployment,
    });
  });

  it('is null when nothing has deployed', () => {
    expect(latestDeployment([pages('empty')])).toBeNull();
    expect(latestDeployment([])).toBeNull();
  });

  it('is exposed on each project view', () => {
    const view = build({
      pages: [
        {
          ...pages('imageryx'),
          latestDeployment: deployment('abc', '2026-09-20T00:00:00.000Z'),
        },
      ],
      workers: [worker('imageryx-api')],
    }).discovered.find((item) => item.slug === 'imageryx');

    expect(view?.latestDeployment?.pagesProject).toBe('imageryx');
    expect(view?.workers).toHaveLength(1);
  });
});
