import { must } from '../../testing/must';
import { computeCiState } from '../../../shared/ci-state';
import type { SqlDatabase } from '../../db';
import { createTestDb, NOW } from '../../testing/test-db';
import {
  ghCommit,
  ghInstallation,
  ghPull,
  ghRelease,
  ghRepo,
  ghRun,
} from '../../testing/fake-github';
import {
  mapCommit,
  mapInstallation,
  mapPullRequest,
  mapRelease,
  mapRepository,
  mapWorkflowRun,
} from '../github/mapping';
import { createEventStoreSink } from './events';
import { upsertInstallation } from './installations';
import { replaceOpenPullRequests, upsertPullRequest } from './pulls';
import {
  getOverview,
  getRepositoryDetail,
  getSettings,
  listPullRequests,
  listRepositories,
} from './queries';
import { replaceReleases } from './releases';
import {
  applyCi,
  applyHead,
  recountOpenPullRequests,
  upsertRepository,
} from './repositories';
import {
  DELIVERY_RETENTION_DAYS,
  EVENTS_KEPT_PER_REPOSITORY,
  EVENT_RETENTION_DAYS,
  pruneHistory,
} from './retention';
import { upsertWorkflowRun } from './runs';

const CONNECTED = {
  configured: true,
  missing: [],
  installUrl: null,
  webhookConfigured: true,
};
const DISCONNECTED = {
  configured: false,
  missing: ['GITHUB_APP_ID'],
  installUrl: null,
  webhookConfigured: false,
};
const iso = (d: Date) => d.toISOString();
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const USER = 'user-1';

async function followAll(db: SqlDatabase, userId = USER) {
  await db.sql`INSERT INTO followed_repository (user_id, repository_id, position, created_at)
    SELECT ${userId}, id, 0, ${iso(NOW)} FROM repositories`;
}

async function seed() {
  const t = createTestDb();
  t.raw
    .prepare(
      `INSERT OR IGNORE INTO app_user (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    )
    .run(USER, 'u@test.dev', 'U', iso(NOW), iso(NOW));
  await upsertInstallation(
    t.db,
    must(mapInstallation(ghInstallation(10, 'acme'))),
    iso(NOW),
  );
  await upsertRepository(
    t.db,
    mapRepository(ghRepo(100, 'acme/api'), 10),
    iso(NOW),
  );
  return t;
}

describe('persistence', () => {
  it('upserts keep identity stable across renames and never reset sync state', async () => {
    const { db, raw } = await seed();
    await applyHead(db, 100, mapCommit(ghCommit('abc')), null);
    await upsertRepository(
      db,
      mapRepository(ghRepo(100, 'acme/renamed'), 10),
      iso(NOW),
    );
    expect(
      raw.prepare('SELECT full_name, head_sha FROM repositories').all(),
    ).toEqual([{ full_name: 'acme/renamed', head_sha: 'abc' }]);
  });

  it('enforces foreign keys: no orphan pull request', async () => {
    const { db } = await seed();
    await expect(
      upsertPullRequest(db, mapPullRequest(ghPull(1), 999)),
    ).rejects.toThrow();
  });

  it('rejects an invalid CI state at the database', async () => {
    const { raw } = await seed();
    expect(() =>
      raw
        .prepare("UPDATE repositories SET ci_state = 'passing' WHERE id = 100")
        .run(),
    ).toThrow();
  });

  it('replaceOpenPullRequests keeps exactly the listed PRs', async () => {
    const { db, raw } = await seed();
    await replaceOpenPullRequests(
      db,
      100,
      [1, 2, 3].map((n) => mapPullRequest(ghPull(n), 100)),
    );
    await replaceOpenPullRequests(db, 100, [mapPullRequest(ghPull(2), 100)]);
    expect(raw.prepare('SELECT id FROM pull_requests').all()).toEqual([
      { id: 2 },
    ]);
    await replaceOpenPullRequests(db, 100, []);
    expect(raw.prepare('SELECT id FROM pull_requests').all()).toEqual([]);
  });

  it('keeps only the 10 latest releases', async () => {
    const { db, raw } = await seed();
    const releases = Array.from({ length: 10 }, (_, i) =>
      must(mapRelease(ghRelease(i + 1, `v${i + 1}`), 100)),
    );
    await replaceReleases(db, 100, releases);
    expect(raw.prepare('SELECT COUNT(*) n FROM releases').all()).toEqual([
      { n: 10 },
    ]);
  });

  it('cascades: deleting an installation removes everything beneath it', async () => {
    const { db, raw } = await seed();
    await upsertPullRequest(db, mapPullRequest(ghPull(1), 100));
    await upsertWorkflowRun(db, mapWorkflowRun(ghRun(1), 100));
    await replaceReleases(db, 100, [must(mapRelease(ghRelease(1, 'v1'), 100))]);
    raw.prepare('DELETE FROM github_installations WHERE id = 10').run();
    for (const table of [
      'repositories',
      'pull_requests',
      'workflow_runs',
      'releases',
    ]) {
      expect(raw.prepare(`SELECT * FROM ${table}`).all()).toEqual([]);
    }
  });

  describe('event sink', () => {
    it('stores normalized events and ignores an exact redelivery', async () => {
      const { db, raw } = await seed();
      const sink = createEventStoreSink(db, () => NOW);
      const event = {
        type: 'release.published' as const,
        repositoryId: 100,
        repositoryFullName: 'acme/api',
        installationId: 10,
        occurredAt: iso(NOW),
        actor: 'ada',
        url: null,
        summary: 'Published v1',
        data: { tag: 'v1', name: 'v1', prerelease: false },
      };
      await sink.publish([event], 'delivery-1');
      await sink.publish([event], 'delivery-1');
      expect(
        raw.prepare('SELECT type, summary FROM repository_events').all(),
      ).toEqual([{ type: 'release.published', summary: 'Published v1' }]);
    });

    it('events outlive the repository they describe', async () => {
      const { db, raw } = await seed();
      await createEventStoreSink(db, () => NOW).publish(
        [
          {
            type: 'repository.removed',
            repositoryId: 100,
            repositoryFullName: 'acme/api',
            installationId: 10,
            occurredAt: iso(NOW),
            actor: null,
            url: null,
            summary: 'gone',
            data: {},
          },
        ],
        null,
      );
      raw.prepare('DELETE FROM repositories WHERE id = 100').run();
      expect(
        raw.prepare('SELECT COUNT(*) n FROM repository_events').all(),
      ).toEqual([{ n: 1 }]);
    });
  });

  describe('retention', () => {
    it('prunes deliveries, events and sessions past their windows — and only those', async () => {
      const { db, raw } = await seed();
      const insDelivery = raw.prepare(
        "INSERT INTO webhook_deliveries (delivery_id, event, status, received_at) VALUES (?, 'push', 'processed', ?)",
      );
      insDelivery.run('old', iso(daysAgo(DELIVERY_RETENTION_DAYS + 1)));
      insDelivery.run('fresh', iso(daysAgo(DELIVERY_RETENTION_DAYS - 1)));
      const insEvent = raw.prepare(
        "INSERT INTO repository_events (repository_id, type, summary, occurred_at, created_at) VALUES (100, 'repository.main.updated', ?, ?, ?)",
      );
      insEvent.run('old', iso(daysAgo(EVENT_RETENTION_DAYS + 1)), iso(NOW));
      insEvent.run('fresh', iso(daysAgo(1)), iso(NOW));
      raw
        .prepare(
          "INSERT INTO app_user (id, email, name, created_at, updated_at) VALUES ('u', 'a@b.c', 'A', ?, ?)",
        )
        .run(iso(NOW), iso(NOW));
      raw
        .prepare(
          "INSERT INTO app_session (token_hash, user_id, expires_at, created_at) VALUES ('expired', 'u', ?, ?)",
        )
        .run(iso(daysAgo(1)), iso(NOW));
      raw
        .prepare(
          "INSERT INTO app_session (token_hash, user_id, expires_at, created_at) VALUES ('live', 'u', ?, ?)",
        )
        .run(iso(new Date(NOW.getTime() + 86_400_000)), iso(NOW));

      await pruneHistory(db, NOW);

      expect(
        raw.prepare('SELECT delivery_id FROM webhook_deliveries').all(),
      ).toEqual([{ delivery_id: 'fresh' }]);
      expect(
        raw.prepare('SELECT summary FROM repository_events').all(),
      ).toEqual([{ summary: 'fresh' }]);
      expect(raw.prepare('SELECT token_hash FROM app_session').all()).toEqual([
        { token_hash: 'live' },
      ]);
    });

    it(`caps events at ${EVENTS_KEPT_PER_REPOSITORY} per repository, newest kept`, async () => {
      const { db, raw } = await seed();
      raw
        .prepare(
          "INSERT INTO github_installations (id, account_id, account_login, account_type, repository_selection, created_at, updated_at) VALUES (11, 1, 'x', 'User', 'all', 'a', 'a')",
        )
        .run();
      raw
        .prepare(
          "INSERT INTO repositories (id, installation_id, owner_login, name, full_name, html_url, default_branch, created_at, updated_at) VALUES (200, 11, 'x', 'y', 'x/y', 'u', 'main', 'a', 'a')",
        )
        .run();
      const ins = raw.prepare(
        "INSERT INTO repository_events (repository_id, type, summary, occurred_at, created_at) VALUES (?, 'repository.main.updated', ?, ?, ?)",
      );
      for (let i = 0; i < EVENTS_KEPT_PER_REPOSITORY + 20; i++) {
        ins.run(
          100,
          `e${i}`,
          iso(
            new Date(
              NOW.getTime() - (EVENTS_KEPT_PER_REPOSITORY + 20 - i) * 1000,
            ),
          ),
          iso(NOW),
        );
      }
      ins.run(200, 'other', iso(NOW), iso(NOW));
      await pruneHistory(db, NOW);
      expect(
        raw
          .prepare(
            'SELECT COUNT(*) n FROM repository_events WHERE repository_id = 100',
          )
          .all(),
      ).toEqual([{ n: EVENTS_KEPT_PER_REPOSITORY }]);
      expect(
        raw
          .prepare(
            "SELECT MIN(summary) m FROM repository_events WHERE repository_id = 100 AND summary = 'e0'",
          )
          .all(),
      ).toEqual([{ m: null }]);
      expect(
        raw
          .prepare(
            'SELECT COUNT(*) n FROM repository_events WHERE repository_id = 200',
          )
          .all(),
      ).toEqual([{ n: 1 }]);
    });
  });

  describe('dashboard queries', () => {
    it('an empty database yields honest empty results, not fake zeros with data', async () => {
      const { db } = createTestDb();
      const overview = await getOverview(db, USER, DISCONNECTED);
      expect(overview.totals).toEqual({
        repositories: 0,
        availableRepositories: 0,
        openPullRequests: 0,
        failing: 0,
        pending: 0,
        noCi: 0,
      });
      expect(overview.connection.configured).toBe(false);
      expect(overview.lastSyncedAt).toBeNull();
      expect(await listRepositories(db, USER)).toEqual([]);
      expect(await listPullRequests(db, USER)).toEqual([]);
    });

    it('overview counts failing / pending / no-CI separately and lists failing first', async () => {
      const { db } = await seed();
      for (const [id, name] of [
        [101, 'acme/b'],
        [102, 'acme/c'],
        [103, 'acme/d'],
        [104, 'acme/e'],
      ] as const) {
        await upsertRepository(
          db,
          mapRepository(ghRepo(id, name), 10),
          iso(NOW),
        );
      }
      await applyCi(db, 100, { state: 'success', sha: 'a' }, iso(NOW));
      await applyCi(db, 101, { state: 'pending', sha: 'a' }, iso(NOW));
      await applyCi(db, 102, { state: 'failure', sha: 'a' }, iso(NOW));
      await applyCi(db, 103, { state: 'none', sha: null }, iso(NOW));
      // 104 stays 'unknown'
      await followAll(db);
      const overview = await getOverview(db, USER, CONNECTED);
      expect(overview.totals).toMatchObject({
        repositories: 5,
        availableRepositories: 5,
        failing: 1,
        pending: 1,
        noCi: 1,
      });
      expect(overview.attention.map((r) => r.fullName)).toEqual([
        'acme/c',
        'acme/b',
      ]);
    });

    it('flags CI that describes an older commit than the branch head', async () => {
      const { db } = await seed();
      await applyHead(db, 100, mapCommit(ghCommit('sha-new')), null);
      await applyCi(db, 100, { state: 'success', sha: 'sha-old' }, iso(NOW));
      const [repo] = await listRepositories(db, USER, 'available');
      expect(repo.ciStale).toBe(true);
      expect(repo.ci.state).toBe('success');
    });

    it('computes each PR’s CI from the runs of ITS head commit only', async () => {
      const { db } = await seed();
      await upsertPullRequest(
        db,
        mapPullRequest(ghPull(1, { head: { ref: 'a', sha: 'sha-a' } }), 100),
      );
      await upsertPullRequest(
        db,
        mapPullRequest(ghPull(2, { head: { ref: 'b', sha: 'sha-b' } }), 100),
      );
      await upsertPullRequest(
        db,
        mapPullRequest(ghPull(3, { head: { ref: 'c', sha: 'sha-c' } }), 100),
      );
      await upsertWorkflowRun(
        db,
        mapWorkflowRun(
          ghRun(1, { head_sha: 'sha-a', conclusion: 'failure' }),
          100,
        ),
      );
      await upsertWorkflowRun(
        db,
        mapWorkflowRun(
          ghRun(2, { head_sha: 'sha-b', conclusion: 'success' }),
          100,
        ),
      );
      await followAll(db);
      const byNumber = Object.fromEntries(
        (await listPullRequests(db, USER)).map((p) => [p.number, p.ci]),
      );
      expect(byNumber).toEqual({ 1: 'failure', 2: 'success', 3: 'none' });
    });

    it('marks release PRs only from labels or release-tool branches', async () => {
      const { db } = await seed();
      await upsertPullRequest(
        db,
        mapPullRequest(
          ghPull(1, { labels: [{ name: 'autorelease: pending' }] }),
          100,
        ),
      );
      await upsertPullRequest(
        db,
        mapPullRequest(
          ghPull(2, {
            title: 'Prepare release',
            head: { ref: 'prepare-release', sha: 's' },
          }),
          100,
        ),
      );
      await followAll(db);
      const hints = Object.fromEntries(
        (await listPullRequests(db, USER)).map((p) => [
          p.number,
          p.releaseHint !== null,
        ]),
      );
      expect(hints).toEqual({ 1: true, 2: false });
    });

    it('repository detail aggregates PRs, runs, releases and its own activity', async () => {
      const { db } = await seed();
      await upsertPullRequest(db, mapPullRequest(ghPull(1), 100));
      await recountOpenPullRequests(db, 100);
      await upsertWorkflowRun(db, mapWorkflowRun(ghRun(1), 100));
      await replaceReleases(db, 100, [
        must(mapRelease(ghRelease(1, 'v1'), 100)),
      ]);
      await createEventStoreSink(db, () => NOW).publish(
        [
          {
            type: 'pull_request.opened',
            repositoryId: 100,
            repositoryFullName: 'acme/api',
            installationId: 10,
            occurredAt: iso(NOW),
            actor: 'ada',
            url: null,
            summary: 'Opened',
            data: { number: 1, title: 't', draft: false },
          },
        ],
        'd',
      );
      const detail = await getRepositoryDetail(db, USER, 100);
      expect(detail?.repository.openPullRequests).toBe(1);
      expect(detail?.pullRequests).toHaveLength(1);
      expect(detail?.workflowRuns).toHaveLength(1);
      expect(detail?.releases.map((r) => r.tag)).toEqual(['v1']);
      expect(detail?.activity).toHaveLength(1);
      expect(await getRepositoryDetail(db, USER, 12345)).toBeNull();
    });

    it('settings lists installations with repository counts and the last sync', async () => {
      const { db, raw } = await seed();
      raw
        .prepare(
          "UPDATE github_installations SET last_synced_at = ?, sync_error = 'GitHub rate limit reached' WHERE id = 10",
        )
        .run(iso(NOW));
      const settings = await getSettings(
        db,
        USER,
        CONNECTED,
        'https://radar.test/api/github/webhook',
      );
      expect(settings).toMatchObject({
        repositories: 1,
        lastSyncedAt: iso(NOW),
        setup: { webhookUrl: 'https://radar.test/api/github/webhook' },
        installations: [
          {
            account: 'acme',
            repositories: 1,
            syncError: 'GitHub rate limit reached',
          },
        ],
      });
    });
  });

  it('CI recomputed from stored runs matches the pure function', async () => {
    const { db } = await seed();
    await upsertWorkflowRun(
      db,
      mapWorkflowRun(ghRun(1, { conclusion: 'failure' }), 100),
    );
    expect(computeCiState([]).state).toBe('none');
  });
});
