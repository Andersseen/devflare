import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addGroup,
  defaultLayout,
  hideItem,
  moveItem,
  type DashboardLayout,
} from '@org/dashboard-layout/logic';

/**
 * Dashboard customization persistence (spec 022) over the real migrations on
 * SQLite: the layout round-trips, is scoped per user, validates ownership of
 * saved-project keys and — the point of the feature — never touches
 * `project_resource`.
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
const store = await import('./dashboard-store');
const { deleteProject } = await import('./project-store');

let raw: ReturnType<typeof openDatabase>;

const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';
const P3 = '33333333-3333-4333-8333-333333333333';
const saved = (id: string) => `saved:${id}`;

function addProject(id: string, userId: string) {
  raw
    .prepare(
      'INSERT INTO projects (id, userId, name, repoUrl, createdAt) VALUES (?, ?, ?, ?, ?)',
    )
    .run(id, userId, id, null, '2026-10-01T00:00:00.000Z');
}

beforeEach(() => {
  raw = openDatabase();
  applyMigrations(raw);
  state.db = sqlOf(raw) as never;
  addProject(P1, 'ada');
  addProject(P2, 'ada');
  addProject(P3, 'bob');
});

describe('layout persistence', () => {
  it('an untouched account is not customized and returns an empty layout', async () => {
    const result = await store.getLayout('ada');
    expect(result.customized).toBe(false);
    expect(result.layout).toEqual({
      groups: [],
      ungroupedIds: [],
      hiddenIds: [],
      pinnedIds: [],
    });
  });

  it('round-trips groups, order, membership and hidden cards', async () => {
    let layout: DashboardLayout = addGroup(
      defaultLayout([saved(P1), saved(P2), 'discovered:strata']),
      'g1',
      'Apps',
    );
    layout = hideItem(moveItem(layout, saved(P2), 'g1'), 'discovered:strata');
    await store.saveLayout('ada', layout);
    const stored = await store.getLayout('ada');
    expect(stored.customized).toBe(true);
    expect(stored.layout).toEqual(layout);
  });

  it('a second save replaces the first and prunes what it no longer lists', async () => {
    await store.saveLayout(
      'ada',
      addGroup(defaultLayout([saved(P1), saved(P2)]), 'g1', 'Apps'),
    );
    await store.saveLayout('ada', defaultLayout([saved(P2)]));
    const { layout } = await store.getLayout('ada');
    expect(layout.groups).toEqual([]);
    expect(layout.ungroupedIds).toEqual([saved(P2)]);
    expect(raw.prepare('SELECT COUNT(*) n FROM dashboard_group').all()).toEqual(
      [{ n: 0 }],
    );
  });

  it('is idempotent (two quick saves)', async () => {
    const layout = addGroup(defaultLayout([saved(P1)]), 'g1', 'Apps');
    await Promise.all([
      store.saveLayout('ada', layout),
      store.saveLayout('ada', layout),
    ]);
    expect((await store.getLayout('ada')).layout).toEqual(layout);
    expect(raw.prepare('SELECT COUNT(*) n FROM dashboard_item').all()).toEqual([
      { n: 1 },
    ]);
  });

  it('keeps users apart', async () => {
    await store.saveLayout('ada', defaultLayout([saved(P1)]));
    await store.saveLayout('bob', defaultLayout([saved(P3)]));
    await store.resetLayout('ada');
    expect((await store.getLayout('ada')).customized).toBe(false);
    expect((await store.getLayout('bob')).layout.ungroupedIds).toEqual([
      saved(P3),
    ]);
  });

  it("refuses another user's project and another user's group id", async () => {
    await expect(
      store.saveLayout('ada', defaultLayout([saved(P3)])),
    ).rejects.toThrow(store.DashboardInputError);
    await store.saveLayout(
      'bob',
      addGroup(defaultLayout([saved(P3)]), 'shared', 'Mine'),
    );
    await expect(
      store.saveLayout(
        'ada',
        addGroup(defaultLayout([saved(P1)]), 'shared', 'Stolen'),
      ),
    ).rejects.toThrow(store.DashboardInputError);
    expect((await store.getLayout('bob')).layout.groups[0].name).toBe('Mine');
  });

  it('dropping a group keeps its cards', async () => {
    await store.saveLayout(
      'ada',
      moveItem(
        addGroup(defaultLayout([saved(P1), saved(P2)]), 'g1', 'Apps'),
        saved(P1),
        'g1',
      ),
    );
    await store.saveLayout('ada', defaultLayout([saved(P1), saved(P2)]));
    expect(
      [...(await store.getLayout('ada')).layout.ungroupedIds].sort(),
    ).toEqual([saved(P1), saved(P2)]);
  });
});

describe('visual grouping is independent of Cloudflare ownership', () => {
  function link(projectId: string, resourceId: string) {
    raw
      .prepare(
        `INSERT INTO project_resource (id, projectId, provider, type, resourceId, resourceName, createdAt)
         VALUES (?, ?, 'cloudflare', 'worker', ?, ?, '2026-10-01T00:00:00.000Z')`,
      )
      .run(`link-${resourceId}`, projectId, resourceId, resourceId);
  }
  const links = () =>
    raw
      .prepare(
        'SELECT projectId, resourceId FROM project_resource ORDER BY resourceId',
      )
      .all();

  it('moving, grouping, hiding and resetting never change project_resource', async () => {
    link(P1, 'api-worker');
    link(P2, 'web-worker');
    const before = links();
    let layout = addGroup(defaultLayout([saved(P1), saved(P2)]), 'g1', 'Apps');
    layout = hideItem(moveItem(layout, saved(P1), 'g1'), saved(P2));
    await store.saveLayout('ada', layout);
    expect(links()).toEqual(before);
    await store.resetLayout('ada');
    expect(links()).toEqual(before);
  });

  it('deleting a project removes only its own dashboard placement', async () => {
    await store.saveLayout('ada', defaultLayout([saved(P1), saved(P2)]));
    expect(await deleteProject('ada', P1)).toBe(true);
    expect((await store.getLayout('ada')).layout.ungroupedIds).toEqual([
      saved(P2),
    ]);
  });
});

describe('discovery identity overrides', () => {
  it('stores, replaces and resets overrides per user', async () => {
    await store.saveIdentityOverrides('ada', [
      {
        slug: 'strata',
        name: 'Strata',
        aliases: ['strata-www'],
        removed: false,
      },
      { slug: 'etym', name: 'Etym', aliases: [], removed: true },
    ]);
    expect(
      (await store.getIdentityOverrides('ada')).map((o) => o.slug),
    ).toEqual(['etym', 'strata']);
    expect(await store.getIdentityOverrides('bob')).toEqual([]);
    await store.saveIdentityOverrides('ada', [
      { slug: 'strata', name: 'Strata', aliases: [], removed: false },
    ]);
    expect(await store.getIdentityOverrides('ada')).toHaveLength(1);
    await store.resetIdentityOverrides('ada');
    expect(await store.getIdentityOverrides('ada')).toEqual([]);
  });

  it('validates input', () => {
    expect(
      store.parseIdentityOverrides({
        identities: [
          { slug: 'my-app', name: ' My  App ', aliases: [' a1 ', 'a1', 'b2'] },
        ],
      }),
    ).toEqual([
      { slug: 'my-app', name: 'My App', aliases: ['a1', 'b2'], removed: false },
    ]);
    for (const bad of [
      null,
      { identities: 'x' },
      { identities: [{ slug: 'Bad Slug', name: 'x', aliases: [] }] },
      { identities: [{ slug: 'a', name: '', aliases: [] }] },
      { identities: [{ slug: 'a', name: 'x', aliases: [''] }] },
      {
        identities: [
          { slug: 'a', name: 'x', aliases: [] },
          { slug: 'a', name: 'y', aliases: [] },
        ],
      },
    ]) {
      expect(() => store.parseIdentityOverrides(bad)).toThrow(
        store.DashboardInputError,
      );
    }
  });
});
