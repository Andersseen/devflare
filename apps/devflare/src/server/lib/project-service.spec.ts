import { webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubGlobal('crypto', webcrypto);

/**
 * The project and project-resource API (spec 019) — every decision the routes
 * make, over the real migrations on SQLite. Only the edges are faked: whether
 * the caller administers the platform, whether a Cloudflare account is
 * connected, and what that account lists.
 *
 * The h3 routes themselves are thin adapters (lib/project-http.ts) and are
 * exercised end to end by apps/devflare-e2e/src/project-resources.spec.ts.
 */

const state = vi.hoisted(() => ({
  db: null as null | { sql: (...args: never[]) => Promise<unknown> },
}));

vi.mock('../db', () => ({
  db: {
    sql: (...args: never[]) => {
      if (!state.db) throw new Error('database not opened');
      return state.db.sql(...args);
    },
  },
}));

const { applyMigrations, openDatabase, sqlOf } = await import(
  '../db/sqlite-test-db'
);
const { CloudflareApiError } = await import('./cloudflare');
const service = await import('./project-service');
const { ProjectApiError } = service;

type Verdict = 'admin' | 'not-admin' | 'unavailable';

let verdict: Verdict;
let connected: boolean;
let inventory: Record<
  string,
  { resourceId: string; resourceName: string }[] | Error
>;
let reads: number;

const access = {
  verdict: async () => verdict,
  credential: async () => {
    if (!connected) {
      throw new CloudflareApiError(
        'no Cloudflare account is connected to this server',
        503,
      );
    }
    return { accountId: 'acc', token: 'tok' };
  },
  reader: () => async (type: string) => {
    reads += 1;
    const value = inventory[type] ?? [];
    if (value instanceof Error) throw value;
    return value;
  },
};

const alice = { id: 'alice', email: 'alice@example.com' };
const bob = { id: 'bob', email: 'bob@example.com' };

function ref(resourceId: string, resourceName = resourceId) {
  return { resourceId, resourceName };
}

beforeEach(() => {
  const raw = openDatabase();
  applyMigrations(raw);
  state.db = sqlOf(raw) as never;
  verdict = 'admin';
  connected = true;
  reads = 0;
  inventory = {
    worker: [ref('ally-api'), ref('ally-runner')],
    pages: [ref('ally-web')],
    d1: [ref('d1-uuid', 'ally-db')],
    kv: [ref('kv-id', 'ally-cache')],
    r2: [ref('ally-reports')],
  };
});

async function refusal(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ProjectApiError) {
      return {
        status: error.status,
        reason: error.reason,
        message: error.message,
      };
    }
    throw error;
  }
  throw new Error('expected a refusal');
}

const create = (name: string, caller = alice) =>
  service.createProjectFor(caller, { name });
const link = (projectId: string, body: unknown, caller = alice) =>
  service.linkResourceFor(caller, projectId, body, access);

describe('projects', () => {
  it('requires a session', async () => {
    expect((await refusal(service.listProjectsFor(null))).status).toBe(401);
    expect(
      (await refusal(service.createProjectFor(null, { name: 'x' }))).status,
    ).toBe(401);
    expect((await refusal(service.listResourcesFor(null, 'x'))).status).toBe(
      401,
    );
  });

  it('creates a project from a name alone, with no resources', async () => {
    const project = await service.createProjectFor(alice, { name: '  Ally  ' });
    expect(project).toMatchObject({
      name: 'Ally',
      repoUrl: null,
      resources: [],
    });
  });

  it('refuses a missing name', async () => {
    expect(await refusal(service.createProjectFor(alice, {}))).toMatchObject({
      status: 400,
      reason: 'invalid',
    });
  });

  it('normalises the repository URL and refuses a malformed one', async () => {
    const project = await service.createProjectFor(alice, {
      name: 'Ally',
      repoUrl: 'andersseen/ally',
    });
    expect(project.repoUrl).toBe('https://github.com/andersseen/ally');

    expect(
      (
        await refusal(
          service.createProjectFor(alice, {
            name: 'Ally',
            repoUrl: 'javascript:alert(1)',
          }),
        )
      ).status,
    ).toBe(400);
  });

  it('edits name and repository', async () => {
    const project = await create('Ally');
    const updated = await service.updateProjectFor(alice, project.id, {
      repoUrl: 'https://github.com/andersseen/ally.git/',
    });
    expect(updated).toMatchObject({
      name: 'Ally',
      repoUrl: 'https://github.com/andersseen/ally',
    });
  });

  it('lists only the caller’s projects, each with its resources', async () => {
    const ally = await create('Ally');
    await create('Bob’s', bob);
    await link(ally.id, { type: 'worker', resourceId: 'ally-api' });

    const projects = await service.listProjectsFor(alice);
    expect(projects).toHaveLength(1);
    expect(projects[0].resources).toMatchObject([
      { type: 'worker', resourceId: 'ally-api', provider: 'cloudflare' },
    ]);
  });

  it('deletes a project with its links, freeing the resource for another', async () => {
    const ally = await create('Ally');
    await link(ally.id, { type: 'worker', resourceId: 'ally-api' });

    await service.deleteProjectFor(alice, ally.id);

    const other = await create('Other');
    await expect(
      link(other.id, { type: 'worker', resourceId: 'ally-api' }),
    ).resolves.toMatchObject({ projectId: other.id });
  });
});

describe('project resources', () => {
  it('links Pages, Workers, D1, R2 and KV to one project', async () => {
    const ally = await create('Ally');

    for (const body of [
      { type: 'pages', resourceId: 'ally-web' },
      { type: 'worker', resourceId: 'ally-api' },
      { type: 'worker', resourceId: 'ally-runner' },
      { type: 'd1', resourceId: 'd1-uuid' },
      { type: 'r2', resourceId: 'ally-reports' },
      { type: 'kv', resourceId: 'kv-id', provider: 'cloudflare' },
    ]) {
      await link(ally.id, body);
    }

    const resources = await service.listResourcesFor(alice, ally.id);
    expect(resources).toHaveLength(6);
    // The label is Cloudflare's, stored beside the stable id.
    expect(resources.find((r) => r.type === 'd1')).toMatchObject({
      resourceId: 'd1-uuid',
      resourceName: 'ally-db',
    });
    expect(resources.find((r) => r.type === 'kv')).toMatchObject({
      resourceId: 'kv-id',
      resourceName: 'ally-cache',
    });
  });

  it('validates provider, type and identifier', async () => {
    const ally = await create('Ally');

    for (const body of [
      { provider: 'aws', type: 'worker', resourceId: 'ally-api' },
      { type: 'queue', resourceId: 'jobs' },
      { type: 'worker' },
      { type: 'worker', resourceId: '   ' },
      null,
    ]) {
      expect(await refusal(link(ally.id, body))).toMatchObject({
        status: 400,
        reason: 'invalid',
      });
    }
  });

  it('refuses a resource the account does not have', async () => {
    const ally = await create('Ally');
    expect(
      await refusal(link(ally.id, { type: 'worker', resourceId: 'nope' })),
    ).toMatchObject({ status: 422, reason: 'not-found' });
  });

  it('matches D1 by its id, not its display name', async () => {
    const ally = await create('Ally');
    expect(
      (await refusal(link(ally.id, { type: 'd1', resourceId: 'ally-db' })))
        .reason,
    ).toBe('not-found');
  });

  it('asks Cloudflare again, fresh, before calling a resource missing', async () => {
    const ally = await create('Ally');
    await refusal(link(ally.id, { type: 'worker', resourceId: 'nope' }));
    expect(reads).toBe(2);
  });

  it('tells "cannot verify" apart from "not found" when a product is unreadable', async () => {
    inventory['r2'] = new CloudflareApiError(
      'Insufficient permissions (Cloudflare error 10000)',
      403,
    );
    const ally = await create('Ally');

    const result = await refusal(
      link(ally.id, { type: 'r2', resourceId: 'ally-reports' }),
    );
    expect(result).toMatchObject({ status: 403, reason: 'unverifiable' });
    expect(result.message).toMatch(/Insufficient permissions/);
  });

  it('writes no link it could not verify', async () => {
    const ally = await create('Ally');
    const body = { type: 'worker', resourceId: 'ally-api' };

    verdict = 'not-admin';
    expect(await refusal(link(ally.id, body))).toMatchObject({
      status: 403,
      reason: 'unverifiable',
    });

    verdict = 'unavailable';
    expect((await refusal(link(ally.id, body))).status).toBe(503);

    verdict = 'admin';
    connected = false;
    expect(await refusal(link(ally.id, body))).toMatchObject({
      status: 503,
      reason: 'unverifiable',
    });

    connected = true;
    inventory['worker'] = new CloudflareApiError('Could not reach', 504);
    expect(await refusal(link(ally.id, body))).toMatchObject({
      status: 503,
      reason: 'unverifiable',
    });

    expect(await service.listResourcesFor(alice, ally.id)).toEqual([]);
  });

  it('gives one resource one owner', async () => {
    const ally = await create('Ally');
    const imageryx = await create('Imageryx');
    const body = { type: 'worker', resourceId: 'ally-api' };
    await link(ally.id, body);

    expect(await refusal(link(ally.id, body))).toMatchObject({
      status: 409,
      reason: 'conflict',
    });

    const elsewhere = await refusal(link(imageryx.id, body));
    expect(elsewhere).toMatchObject({ status: 409, reason: 'conflict' });
    expect(elsewhere.message).toMatch(/Ally/);
  });

  it('does not name another user’s project in a conflict', async () => {
    const secret = await create('Secret', bob);
    await link(secret.id, { type: 'worker', resourceId: 'ally-api' }, bob);
    const ally = await create('Ally');

    const result = await refusal(
      link(ally.id, { type: 'worker', resourceId: 'ally-api' }),
    );
    expect(result.status).toBe(409);
    expect(result.message).not.toMatch(/Secret/);
  });

  it('unlinks one resource and leaves the rest', async () => {
    const ally = await create('Ally');
    const api = await link(ally.id, { type: 'worker', resourceId: 'ally-api' });
    await link(ally.id, { type: 'worker', resourceId: 'ally-runner' });

    await service.unlinkResourceFor(alice, ally.id, api.id);

    expect(
      (await service.listResourcesFor(alice, ally.id)).map((r) => r.resourceId),
    ).toEqual(['ally-runner']);
    expect(
      (await refusal(service.unlinkResourceFor(alice, ally.id, api.id))).status,
    ).toBe(404);
  });

  it('unlinks without needing Cloudflare at all', async () => {
    const ally = await create('Ally');
    const api = await link(ally.id, { type: 'worker', resourceId: 'ally-api' });

    verdict = 'not-admin';
    connected = false;
    await expect(
      service.unlinkResourceFor(alice, ally.id, api.id),
    ).resolves.toBeUndefined();
  });

  it('isolates projects between users', async () => {
    const ally = await create('Ally');
    const api = await link(ally.id, { type: 'worker', resourceId: 'ally-api' });

    for (const attempt of [
      service.getProjectFor(bob, ally.id),
      service.listResourcesFor(bob, ally.id),
      service.updateProjectFor(bob, ally.id, { name: 'Mine' }),
      service.deleteProjectFor(bob, ally.id),
      service.linkResourceFor(
        bob,
        ally.id,
        { type: 'worker', resourceId: 'ally-runner' },
        access,
      ),
      service.unlinkResourceFor(bob, ally.id, api.id),
    ]) {
      expect((await refusal(attempt)).status).toBe(404);
    }

    expect(await service.getProjectFor(alice, ally.id)).toMatchObject({
      name: 'Ally',
      resources: [{ resourceId: 'ally-api' }],
    });
  });

  it('cannot unlink another project’s resource through this project', async () => {
    const ally = await create('Ally');
    const other = await create('Other');
    const api = await link(ally.id, { type: 'worker', resourceId: 'ally-api' });

    expect(
      (await refusal(service.unlinkResourceFor(alice, other.id, api.id)))
        .status,
    ).toBe(404);
  });
});
