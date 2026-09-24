import { describe, expect, it } from 'vitest';
import type {
  CloudPagesProject,
  CloudWorker,
} from './cloudflare-account.service';
import type { Project, ProjectResource } from './projects.service';
import {
  cloudResourcePath,
  countLabel,
  groupResources,
  linkCandidates,
  ownershipIndex,
  resolveProjectResources,
  resourceCounts,
  type CloudInventory,
} from './project-resources';

function worker(name: string): CloudWorker {
  return {
    name,
    createdOn: '2026-09-01T00:00:00.000Z',
    modifiedOn: '2026-09-20T00:00:00.000Z',
    domains: [],
  };
}

function pages(name: string): CloudPagesProject {
  return {
    name,
    subdomain: `${name}.pages.dev`,
    domains: [],
    productionBranch: 'main',
    createdOn: '2026-09-01T00:00:00.000Z',
    repo: null,
    gitConnected: false,
    latestDeployment: null,
  };
}

function inventory(overrides: Partial<CloudInventory> = {}): CloudInventory {
  return {
    worker: { items: [worker('ally-api'), worker('ally-runner')], error: null },
    pages: { items: [pages('ally-web')], error: null },
    d1: {
      items: [
        {
          id: 'd1-uuid',
          name: 'ally-db-renamed',
          createdAt: null,
          sizeBytes: null,
          tables: null,
        },
      ],
      error: null,
    },
    kv: { items: [{ id: 'kv-id', name: 'ally-cache' }], error: null },
    r2: {
      items: [{ name: 'ally-reports', createdAt: '', location: null }],
      error: null,
    },
    ...overrides,
  };
}

let nextId = 0;
function link(
  type: ProjectResource['type'],
  resourceId: string,
  projectId = 'ally',
  resourceName = resourceId,
): ProjectResource {
  nextId += 1;
  return {
    id: `link-${nextId}`,
    projectId,
    provider: 'cloudflare',
    type,
    resourceId,
    resourceName,
    createdAt: '2026-09-01T00:00:00.000Z',
  };
}

function project(id: string, resources: ProjectResource[]): Project {
  return {
    id,
    userId: 'u',
    name: id,
    repoUrl: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    resources,
  };
}

describe('resolveProjectResources', () => {
  it('resolves Pages, Workers, D1, R2 and KV against the account', () => {
    const resolved = resolveProjectResources(
      [
        link('kv', 'kv-id', 'ally', 'ally-cache'),
        link('worker', 'ally-runner'),
        link('pages', 'ally-web'),
        link('d1', 'd1-uuid', 'ally', 'ally-db'),
        link('r2', 'ally-reports'),
        link('worker', 'ally-api'),
      ],
      inventory(),
    );

    expect(resolved.map((r) => [r.type, r.name, r.state])).toEqual([
      ['pages', 'ally-web', 'available'],
      ['worker', 'ally-api', 'available'],
      ['worker', 'ally-runner', 'available'],
      // Matched by id, labelled with Cloudflare's current name.
      ['d1', 'ally-db-renamed', 'available'],
      ['r2', 'ally-reports', 'available'],
      ['kv', 'ally-cache', 'available'],
    ]);
  });

  it('keeps a link Cloudflare no longer lists, marked missing', () => {
    const [resolved] = resolveProjectResources(
      [link('worker', 'deleted-worker')],
      inventory(),
    );
    expect(resolved).toMatchObject({
      name: 'deleted-worker',
      state: 'missing',
      detail: null,
    });
    expect(resolved.reason).toMatch(/Missing/);
  });

  it('calls a link unverifiable, not missing, when its product cannot be read', () => {
    const [api, bucket] = resolveProjectResources(
      [link('r2', 'ally-reports'), link('worker', 'ally-api')],
      inventory({
        r2: {
          items: [],
          error: 'Insufficient permissions (Cloudflare error 10000)',
        },
      }),
    );
    expect(api.state).toBe('available');
    expect(bucket).toMatchObject({
      type: 'r2',
      state: 'unverifiable',
      reason: 'Insufficient permissions (Cloudflare error 10000)',
    });
  });

  it('marks everything unverifiable when there is no account to ask', () => {
    const resolved = resolveProjectResources(
      [link('worker', 'ally-api'), link('pages', 'ally-web')],
      null,
      'Cloudflare is not connected',
    );
    expect(resolved.every((r) => r.state === 'unverifiable')).toBe(true);
    expect(resolved[0].reason).toBe('Cloudflare is not connected');
  });

  it('resolves nothing for a project that owns nothing', () => {
    expect(resolveProjectResources([], inventory())).toEqual([]);
  });
});

describe('grouping and counts', () => {
  it('groups into Web, Compute and Storage, dropping empty groups', () => {
    const resolved = resolveProjectResources(
      [link('worker', 'ally-api'), link('r2', 'ally-reports')],
      inventory(),
    );
    expect(groupResources(resolved).map((g) => g.label)).toEqual([
      'Compute',
      'Storage',
    ]);
  });

  it('counts ownership per type, missing links included', () => {
    const counts = resourceCounts([
      link('worker', 'a'),
      link('worker', 'b'),
      link('pages', 'c'),
      link('r2', 'd'),
      link('r2', 'e'),
      link('d1', 'f'),
    ]);
    expect(counts.map((c) => countLabel(c.type, c.count))).toEqual([
      '1 Pages',
      '2 Workers',
      '1 D1',
      '2 R2',
    ]);
  });
});

describe('linkCandidates', () => {
  it('offers what the project does not own, and shows what another owns', () => {
    const ally = project('ally', [link('worker', 'ally-api', 'ally')]);
    const imageryx = project('imageryx', [
      link('pages', 'ally-web', 'imageryx'),
    ]);
    const sections = linkCandidates(
      inventory(),
      ownershipIndex([ally, imageryx]),
      'ally',
    );

    const workers = sections.find((s) => s.type === 'worker');
    expect(workers?.items.map((c) => c.ref.name)).toEqual(['ally-runner']);

    const web = sections.find((s) => s.type === 'pages');
    expect(web?.items[0]).toMatchObject({
      ref: { name: 'ally-web' },
      owner: { project: { id: 'imageryx' } },
    });
  });

  it('reports an unreadable product as an error, not as an empty list', () => {
    const sections = linkCandidates(
      inventory({ r2: { items: [], error: 'Insufficient permissions' } }),
      new Map(),
      'ally',
    );
    expect(sections.find((s) => s.type === 'r2')).toEqual({
      type: 'r2',
      error: 'Insufficient permissions',
      items: [],
    });
    expect(sections.find((s) => s.type === 'kv')?.error).toBeNull();
  });
});

describe('ownershipIndex', () => {
  it('finds the owning project by type and stable id', () => {
    const ally = project('ally', [link('d1', 'd1-uuid', 'ally', 'ally-db')]);
    const index = ownershipIndex([ally, project('empty', [])]);
    expect(index.get('d1:d1-uuid')?.project.id).toBe('ally');
    expect(index.get('d1:ally-db')).toBeUndefined();
  });
});

describe('cloudResourcePath', () => {
  it('opens the resource where the Cloud section has a page for it', () => {
    expect(cloudResourcePath('worker', 'api')).toEqual([
      '/cloud/workers',
      'api',
    ]);
    expect(cloudResourcePath('r2', 'b')).toEqual(['/cloud/buckets', 'b']);
    expect(cloudResourcePath('kv', 'id')).toEqual(['/cloud/storage']);
  });
});
