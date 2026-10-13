import { describe, expect, it } from 'vitest';
import {
  addGroup,
  defaultLayout,
  moveItem,
  togglePin,
} from '@org/dashboard-layout/logic';
import { must } from '../../testing/must';
import { createTestDb, NOW } from '../../testing/test-db';
import {
  ghInstallation,
  ghPull,
  ghRelease,
  ghRepo,
} from '../../testing/fake-github';
import {
  mapInstallation,
  mapPullRequest,
  mapRelease,
  mapRepository,
} from '../github/mapping';
import {
  LayoutInputError,
  countFollowed,
  getDashboardLayout,
  resetDashboardLayout,
  saveDashboardLayout,
} from './dashboard';
import { createEventStoreSink } from './events';
import { upsertInstallation } from './installations';
import { upsertPullRequest } from './pulls';
import {
  getOverview,
  getRepositoryDetail,
  getSettings,
  listActivity,
  listPullRequests,
  listRepositories,
} from './queries';
import { replaceReleases } from './releases';
import { recountOpenPullRequests, upsertRepository } from './repositories';

const iso = NOW.toISOString();
const CONNECTED = {
  configured: true,
  missing: [],
  installUrl: null,
  webhookConfigured: true,
};

async function setup() {
  const t = createTestDb();
  for (const user of ['ada', 'bob']) {
    t.raw
      .prepare(
        'INSERT INTO app_user (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(user, `${user}@test.dev`, user, iso, iso);
  }
  await upsertInstallation(
    t.db,
    must(mapInstallation(ghInstallation(10, 'acme'))),
    iso,
  );
  // 100 api, 101 web, 102 docs — each with a PR, a release and an event.
  for (const [id, name] of [
    [100, 'acme/api'],
    [101, 'acme/web'],
    [102, 'acme/docs'],
  ] as const) {
    await upsertRepository(t.db, mapRepository(ghRepo(id, name), 10), iso);
    await upsertPullRequest(t.db, mapPullRequest(ghPull(id), id));
    await recountOpenPullRequests(t.db, id);
    await replaceReleases(t.db, id, [
      must(mapRelease(ghRelease(id, `v${id}`), id)),
    ]);
    await createEventStoreSink(t.db, () => NOW).publish(
      [
        {
          type: 'pull_request.opened',
          repositoryId: id,
          repositoryFullName: name,
          installationId: 10,
          occurredAt: iso,
          actor: 'ada',
          url: null,
          summary: 'Opened',
          data: { number: id, title: 't', draft: false },
        },
      ],
      `d-${id}`,
    );
  }
  return t;
}

const follow = (...ids: number[]) => defaultLayout(ids.map(String));

describe('followed repositories', () => {
  it('a new user follows nothing: totals are zero, available is not', async () => {
    const { db } = await setup();
    const overview = await getOverview(db, 'ada', CONNECTED);
    expect(overview.totals).toMatchObject({
      repositories: 0,
      availableRepositories: 3,
      openPullRequests: 0,
    });
    expect(overview.attention).toEqual([]);
    expect(overview.recentReleases).toEqual([]);
    expect(overview.recentActivity).toEqual([]);
    expect(await listRepositories(db, 'ada')).toEqual([]);
    expect(await listRepositories(db, 'ada', 'available')).toHaveLength(3);
  });

  it('persists and returns the layout; totals, PRs, releases and activity count followed repositories only', async () => {
    const { db } = await setup();
    await saveDashboardLayout(db, 'ada', follow(100, 102));

    const overview = await getOverview(db, 'ada', CONNECTED);
    expect(overview.totals.repositories).toBe(2);
    expect(overview.totals.openPullRequests).toBe(2);
    expect(
      overview.recentReleases.map((r) => r.repositoryFullName).sort(),
    ).toEqual(['acme/api', 'acme/docs']);
    expect(
      overview.recentActivity.map((e) => e.repositoryFullName).sort(),
    ).toEqual(['acme/api', 'acme/docs']);
    expect(
      (await listPullRequests(db, 'ada'))
        .map((p) => p.repositoryFullName)
        .sort(),
    ).toEqual(['acme/api', 'acme/docs']);
    expect(
      (await listActivity(db, 'ada')).map((e) => e.repositoryId).sort(),
    ).toEqual([100, 102]);
    expect((await listRepositories(db, 'ada')).map((r) => r.fullName)).toEqual([
      'acme/api',
      'acme/docs',
    ]);
    expect(await getDashboardLayout(db, 'ada')).toEqual(follow(100, 102));
    expect(await countFollowed(db, 'ada')).toBe(2);
  });

  it('keeps preferences per user', async () => {
    const { db } = await setup();
    await saveDashboardLayout(db, 'ada', follow(100));
    await saveDashboardLayout(db, 'bob', follow(101, 102));
    expect((await getDashboardLayout(db, 'ada')).ungroupedIds).toEqual(['100']);
    expect((await getDashboardLayout(db, 'bob')).ungroupedIds).toEqual([
      '101',
      '102',
    ]);
    expect((await getOverview(db, 'bob', CONNECTED)).totals.repositories).toBe(
      2,
    );
  });

  it("flags followed in the available list and does not hide unfollowed repositories' details", async () => {
    const { db } = await setup();
    await saveDashboardLayout(db, 'ada', follow(100));
    const all = await listRepositories(db, 'ada', 'available');
    expect(Object.fromEntries(all.map((r) => [r.id, r.followed]))).toEqual({
      100: true,
      101: false,
      102: false,
    });
    const detail = await getRepositoryDetail(db, 'ada', 101);
    expect(detail?.repository.followed).toBe(false);
    expect(detail?.pullRequests).toHaveLength(1);
  });

  it('settings report installed and followed counts separately', async () => {
    const { db } = await setup();
    await saveDashboardLayout(db, 'ada', follow(100));
    const settings = await getSettings(db, 'ada', CONNECTED, 'https://r/h');
    expect(settings.repositories).toBe(3);
    expect(settings.followedRepositories).toBe(1);
  });

  it('a rename keeps the preference (the key is the GitHub id)', async () => {
    const { db } = await setup();
    await saveDashboardLayout(db, 'ada', follow(100));
    await upsertRepository(
      db,
      mapRepository(ghRepo(100, 'acme/renamed'), 10),
      iso,
    );
    expect((await listRepositories(db, 'ada')).map((r) => r.fullName)).toEqual([
      'acme/renamed',
    ]);
  });

  it('a newly synchronized repository is available but never auto-followed', async () => {
    const { db } = await setup();
    await saveDashboardLayout(db, 'ada', follow(100));
    await upsertRepository(db, mapRepository(ghRepo(103, 'acme/new'), 10), iso);
    expect(await listRepositories(db, 'ada')).toHaveLength(1);
    expect(await listRepositories(db, 'ada', 'available')).toHaveLength(4);
  });

  it('a repository that disappears and returns keeps its follow, group and pin', async () => {
    const { db, raw } = await setup();
    let layout = addGroup(follow(100, 101), 'g1', 'Libs');
    layout = togglePin(moveItem(layout, '101', 'g1'), '101');
    await saveDashboardLayout(db, 'ada', layout);

    raw.prepare('DELETE FROM repositories WHERE id = 101').run();
    expect((await getDashboardLayout(db, 'ada')).ungroupedIds).toEqual(['100']);

    await upsertRepository(db, mapRepository(ghRepo(101, 'acme/web'), 10), iso);
    expect(await getDashboardLayout(db, 'ada')).toEqual(layout);
  });
});

describe('saveDashboardLayout', () => {
  it('stores groups, order and pins, and replaces on every save', async () => {
    const { db } = await setup();
    let layout = addGroup(
      addGroup(follow(100, 101, 102), 'g1', 'Apps'),
      'g2',
      'Libs',
    );
    layout = moveItem(moveItem(layout, '101', 'g1'), '102', 'g2');
    layout = togglePin(layout, '100');
    await saveDashboardLayout(db, 'ada', layout);
    expect(await getDashboardLayout(db, 'ada')).toEqual(layout);

    // A second save fully replaces it: drop 102 (unfollow) and the Libs group.
    const next = addGroup(follow(100, 101), 'g1', 'Apps');
    await saveDashboardLayout(db, 'ada', next);
    const stored = await getDashboardLayout(db, 'ada');
    expect(stored).toEqual(next);
    expect(await countFollowed(db, 'ada')).toBe(2);
  });

  it('is idempotent', async () => {
    const { db, raw } = await setup();
    const layout = addGroup(follow(100, 101), 'g1', 'Apps');
    await saveDashboardLayout(db, 'ada', layout);
    await saveDashboardLayout(db, 'ada', layout);
    expect(
      raw.prepare('SELECT COUNT(*) n FROM followed_repository').all(),
    ).toEqual([{ n: 2 }]);
    expect(raw.prepare('SELECT COUNT(*) n FROM dashboard_group').all()).toEqual(
      [{ n: 1 }],
    );
  });

  it('rejects unknown repositories and leaves the stored layout untouched', async () => {
    const { db } = await setup();
    await saveDashboardLayout(db, 'ada', follow(100));
    await expect(
      saveDashboardLayout(db, 'ada', follow(100, 999)),
    ).rejects.toThrow(LayoutInputError);
    expect((await getDashboardLayout(db, 'ada')).ungroupedIds).toEqual(['100']);
  });

  it("cannot take over or attach to another user's group id", async () => {
    const { db } = await setup();
    await saveDashboardLayout(
      db,
      'ada',
      addGroup(follow(100), 'shared', 'Mine'),
    );
    await expect(
      saveDashboardLayout(
        db,
        'bob',
        moveItem(addGroup(follow(101), 'shared', 'Stolen'), '101', 'shared'),
      ),
    ).rejects.toThrow(LayoutInputError);
    const ada = await getDashboardLayout(db, 'ada');
    expect(ada.groups).toEqual([{ id: 'shared', name: 'Mine', itemIds: [] }]);
    expect((await getDashboardLayout(db, 'bob')).groups).toEqual([]);
  });

  it('deleting a group (by leaving it out) keeps its repositories followed', async () => {
    const { db } = await setup();
    await saveDashboardLayout(
      db,
      'ada',
      moveItem(addGroup(follow(100, 101), 'g', 'G'), '100', 'g'),
    );
    await saveDashboardLayout(db, 'ada', follow(100, 101));
    const stored = await getDashboardLayout(db, 'ada');
    expect(stored.groups).toEqual([]);
    expect(stored.ungroupedIds.sort()).toEqual(['100', '101']);
  });

  it('removing a user cascades their preferences', async () => {
    const { db, raw } = await setup();
    await saveDashboardLayout(db, 'ada', addGroup(follow(100), 'g', 'G'));
    raw.prepare("DELETE FROM app_user WHERE id = 'ada'").run();
    expect(
      raw.prepare('SELECT COUNT(*) n FROM followed_repository').all(),
    ).toEqual([{ n: 0 }]);
    expect(raw.prepare('SELECT COUNT(*) n FROM dashboard_group').all()).toEqual(
      [{ n: 0 }],
    );
  });
});

describe('resetDashboardLayout', () => {
  it('drops groups and pins, keeps the followed set, orders by name', async () => {
    const { db } = await setup();
    let layout = addGroup(follow(102, 100, 101), 'g', 'G');
    layout = togglePin(moveItem(layout, '101', 'g'), '100');
    await saveDashboardLayout(db, 'ada', layout);
    await resetDashboardLayout(db, 'ada');
    const stored = await getDashboardLayout(db, 'ada');
    expect(stored.groups).toEqual([]);
    expect(stored.pinnedIds).toEqual([]);
    expect(stored.ungroupedIds).toEqual(['100', '102', '101']); // api, docs, web
  });
});
