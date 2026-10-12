import type {
  DomainEvent,
  DomainEventSink,
} from '../../../shared/domain-events';
import {
  createFakeGitHub,
  emptyWorld,
  ghCommit,
  ghInstallation,
  ghPull,
  ghRelease,
  ghRepo,
  ghRun,
  repoState,
  testPrivateKeyPem,
  type FakeWorld,
} from '../../testing/fake-github';
import { createTestDb, NOW } from '../../testing/test-db';
import { createGitHubApi } from '../github/api';
import { SYNC_LEASE_MS, acquireSyncLease } from '../store/installations';
import { syncAll } from './sync';

function setup(budget = 200) {
  const { raw, db } = createTestDb();
  const world = emptyWorld();
  const fake = createFakeGitHub(world);
  const budgetRef = { remaining: budget };
  const events: DomainEvent[] = [];
  const sink: DomainEventSink = {
    publish: async (e) => void events.push(...e),
  };
  const api = createGitHubApi({
    appId: '1',
    privateKey: testPrivateKeyPem(),
    fetch: fake.fetch,
    budget: budgetRef,
    sleep: async () => undefined,
  });
  const run = (options = {}) =>
    syncAll({ db, api, sink, budget: budgetRef, now: () => NOW }, options);
  const rows = <T>(sql: string, ...v: unknown[]) =>
    raw.prepare(sql).all(...v) as T[];
  return { raw, db, world, fake, budgetRef, events, run, rows };
}

function oneRepoWorld(
  world: FakeWorld,
  state = repoState({ repo: ghRepo(100, 'acme/api') }),
) {
  world.installations = [ghInstallation(10, 'acme')];
  world.repositories[10] = [[state]];
}

describe('synchronization', () => {
  it('imports installations, repositories, PRs, runs, releases and head commit', async () => {
    const t = setup();
    oneRepoWorld(
      t.world,
      repoState({
        repo: ghRepo(100, 'acme/api', { private: true }),
        commit: ghCommit('sha-main', 'fix: thing'),
        pulls: [
          [
            ghPull(1, { labels: [{ name: 'release' }] }),
            ghPull(2, { draft: true }),
          ],
        ],
        runs: [ghRun(1)],
        releases: [ghRelease(1, 'v1.0.0')],
      }),
    );

    const result = await t.run();
    expect(result).toEqual({
      installations: 1,
      repositoriesSynced: 1,
      repositoriesRemaining: 0,
      errors: [],
    });

    expect(
      t.rows(
        'SELECT account_login, last_synced_at, sync_error, sync_lease_until FROM github_installations',
      ),
    ).toEqual([
      {
        account_login: 'acme',
        last_synced_at: NOW.toISOString(),
        sync_error: null,
        sync_lease_until: null,
      },
    ]);
    expect(
      t.rows(
        'SELECT full_name, private, head_sha, head_message, ci_state, ci_sha, open_pr_count, version, version_source, last_synced_at FROM repositories',
      ),
    ).toEqual([
      {
        full_name: 'acme/api',
        private: 1,
        head_sha: 'sha-main',
        head_message: 'fix: thing',
        ci_state: 'success',
        ci_sha: 'sha-main',
        open_pr_count: 2,
        version: 'v1.0.0',
        version_source: 'release',
        last_synced_at: NOW.toISOString(),
      },
    ]);
    expect(
      t.rows('SELECT number, draft FROM pull_requests ORDER BY number'),
    ).toEqual([
      { number: 1, draft: 0 },
      { number: 2, draft: 1 },
    ]);
  });

  it('a repository with no workflow runs is "none", never success', async () => {
    const t = setup();
    oneRepoWorld(
      t.world,
      repoState({ repo: ghRepo(100, 'acme/api'), runs: [] }),
    );
    await t.run();
    expect(t.rows('SELECT ci_state, ci_sha FROM repositories')).toEqual([
      { ci_state: 'none', ci_sha: null },
    ]);
  });

  it('unreadable Actions (403) leaves CI "unknown", and the rest of the repo still syncs', async () => {
    const t = setup();
    oneRepoWorld(
      t.world,
      repoState({
        repo: ghRepo(100, 'acme/api'),
        runs: null,
        pulls: [[ghPull(1)]],
      }),
    );
    const result = await t.run();
    expect(result.errors).toEqual([]);
    expect(t.rows('SELECT ci_state, open_pr_count FROM repositories')).toEqual([
      { ci_state: 'unknown', open_pr_count: 1 },
    ]);
  });

  it('falls back to the newest tag when there are no releases', async () => {
    const t = setup();
    oneRepoWorld(
      t.world,
      repoState({ repo: ghRepo(100, 'acme/api'), tags: ['v0.3.0'] }),
    );
    await t.run();
    expect(t.rows('SELECT version, version_source FROM repositories')).toEqual([
      { version: 'v0.3.0', version_source: 'tag' },
    ]);
  });

  it('an empty repository (no commits) still syncs', async () => {
    const t = setup();
    oneRepoWorld(
      t.world,
      repoState({ repo: ghRepo(100, 'acme/api'), commit: null }),
    );
    const result = await t.run();
    expect(result.errors).toEqual([]);
    expect(t.rows('SELECT head_sha FROM repositories')).toEqual([
      { head_sha: null },
    ]);
  });

  it('is idempotent: running twice changes nothing and duplicates nothing', async () => {
    const t = setup();
    oneRepoWorld(
      t.world,
      repoState({
        repo: ghRepo(100, 'acme/api'),
        pulls: [[ghPull(1)]],
        runs: [ghRun(1)],
        releases: [ghRelease(1, 'v1')],
      }),
    );
    await t.run();
    const snapshot = JSON.stringify([
      t.rows('SELECT * FROM repositories'),
      t.rows('SELECT * FROM pull_requests'),
      t.rows('SELECT * FROM workflow_runs'),
      t.rows('SELECT * FROM releases'),
    ]);
    t.budgetRef.remaining = 200;
    await t.run();
    expect(
      JSON.stringify([
        t.rows('SELECT * FROM repositories'),
        t.rows('SELECT * FROM pull_requests'),
        t.rows('SELECT * FROM workflow_runs'),
        t.rows('SELECT * FROM releases'),
      ]),
    ).toBe(snapshot);
  });

  it('reconciles a PR closed while webhooks were missed', async () => {
    const t = setup();
    oneRepoWorld(
      t.world,
      repoState({
        repo: ghRepo(100, 'acme/api'),
        pulls: [[ghPull(1), ghPull(2)]],
      }),
    );
    await t.run();
    expect(t.rows('SELECT id FROM pull_requests')).toHaveLength(2);

    t.world.repositories[10] = [
      [repoState({ repo: ghRepo(100, 'acme/api'), pulls: [[ghPull(2)]] })],
    ];
    t.budgetRef.remaining = 200;
    await t.run();
    expect(t.rows('SELECT id FROM pull_requests')).toEqual([{ id: 2 }]);
    expect(t.rows('SELECT open_pr_count FROM repositories')).toEqual([
      { open_pr_count: 1 },
    ]);
  });

  it('follows a rename: same id, new name', async () => {
    const t = setup();
    oneRepoWorld(t.world);
    await t.run();
    t.world.repositories[10] = [
      [repoState({ repo: ghRepo(100, 'acme/api-renamed') })],
    ];
    t.budgetRef.remaining = 200;
    await t.run();
    expect(t.rows('SELECT id, full_name FROM repositories')).toEqual([
      { id: 100, full_name: 'acme/api-renamed' },
    ]);
  });

  it('removes repositories the App lost access to, with a repository.removed event', async () => {
    const t = setup();
    t.world.installations = [ghInstallation(10, 'acme')];
    t.world.repositories[10] = [
      [
        repoState({ repo: ghRepo(100, 'acme/a') }),
        repoState({ repo: ghRepo(101, 'acme/b') }),
      ],
    ];
    await t.run();

    t.world.repositories[10] = [[repoState({ repo: ghRepo(100, 'acme/a') })]];
    t.budgetRef.remaining = 200;
    await t.run();
    expect(t.rows('SELECT id FROM repositories')).toEqual([{ id: 100 }]);
    expect(t.events.map((e) => [e.type, e.repositoryFullName])).toEqual([
      ['repository.removed', 'acme/b'],
    ]);
  });

  it('drops an installation GitHub no longer lists (missed uninstall webhook)', async () => {
    const t = setup();
    oneRepoWorld(t.world);
    await t.run();
    t.world.installations = [];
    t.budgetRef.remaining = 200;
    await t.run();
    expect(t.rows('SELECT * FROM github_installations')).toEqual([]);
    expect(t.rows('SELECT * FROM repositories')).toEqual([]);
  });

  it('skips suspended installations', async () => {
    const t = setup();
    oneRepoWorld(t.world);
    t.world.installations = [
      ghInstallation(10, 'acme', { suspended_at: '2026-10-01T00:00:00Z' }),
    ];
    const result = await t.run();
    expect(result.installations).toBe(0);
    expect(t.rows('SELECT * FROM repositories')).toEqual([]);
  });

  it('publishes no CI / PR / main events: a reconcile is not news', async () => {
    const t = setup();
    oneRepoWorld(
      t.world,
      repoState({
        repo: ghRepo(100, 'acme/api'),
        runs: [ghRun(1, { conclusion: 'failure' })],
        pulls: [[ghPull(1)]],
      }),
    );
    await t.run();
    expect(t.events).toEqual([]);
  });

  describe('bounded work', () => {
    function manyRepos(t: ReturnType<typeof setup>, n: number) {
      t.world.installations = [ghInstallation(10, 'acme')];
      t.world.repositories[10] = [
        Array.from({ length: n }, (_, i) =>
          repoState({ repo: ghRepo(i + 1, `acme/r${i + 1}`) }),
        ),
      ];
    }

    it('stops at the request budget and rotates through the rest on the next run', async () => {
      const t = setup(18); // jwt-less budget: token(1)+repos(1)+installations(1)=3, ~5 calls per repo
      manyRepos(t, 8);
      const first = await t.run();
      expect(first.repositoriesSynced).toBeGreaterThan(0);
      expect(first.repositoriesSynced).toBeLessThan(8);
      expect(first.repositoriesRemaining).toBe(8 - first.repositoriesSynced);
      expect(first.errors).toEqual([]);

      const syncedFirst = t
        .rows<{
          id: number;
        }>('SELECT id FROM repositories WHERE last_synced_at IS NOT NULL')
        .map((r) => r.id);

      t.budgetRef.remaining = 18;
      await t.run();
      const syncedAfter = t
        .rows<{
          id: number;
        }>('SELECT id FROM repositories WHERE last_synced_at IS NOT NULL')
        .map((r) => r.id);
      // The second run picked up repositories the first never reached.
      expect(syncedAfter.length).toBeGreaterThan(syncedFirst.length);
    });

    it('never exceeds the budget', async () => {
      const t = setup(12);
      manyRepos(t, 10);
      await t.run();
      expect(t.fake.calls.length).toBeLessThanOrEqual(12);
    });

    it('a rate limit stops the run, is recorded on the installation, and leaves data intact', async () => {
      const t = setup();
      oneRepoWorld(t.world, repoState({ repo: ghRepo(100, 'acme/api') }));
      await t.run();
      const before = t.rows(
        'SELECT head_sha, last_synced_at FROM repositories',
      );

      t.world.failures['/repos/acme/api/pulls'] = () =>
        new Response('{}', {
          status: 403,
          headers: {
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': '1800000000',
          },
        });
      t.budgetRef.remaining = 200;
      const result = await t.run();

      expect(result.repositoriesSynced).toBe(0);
      const [inst] = t.rows<{
        sync_error: string;
        sync_lease_until: string | null;
      }>('SELECT sync_error, sync_lease_until FROM github_installations');
      expect(inst.sync_error).toContain('rate limit');
      expect(inst.sync_lease_until).toBeNull(); // lease released
      expect(
        t.rows('SELECT head_sha, last_synced_at FROM repositories'),
      ).toEqual(before);
    });

    it('one failing repository is reported but does not stop the others', async () => {
      const t = setup();
      manyRepos(t, 3);
      t.world.failures['/repos/acme/r2/releases'] = () =>
        new Response('{}', { status: 500 });
      const result = await t.run();
      expect(result.repositoriesSynced).toBe(2);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('acme/r2');
    });

    it('records installation-level failures without leaking details', async () => {
      const t = setup();
      oneRepoWorld(t.world);
      t.world.failures['/installation/repositories'] = () =>
        new Response('{"message":"bad creds ghs_secret"}', { status: 401 });
      const result = await t.run();
      expect(JSON.stringify(result)).not.toContain('ghs_');
      expect(
        t.rows<{ sync_error: string }>(
          'SELECT sync_error FROM github_installations',
        )[0].sync_error,
      ).toContain('401');
    });
  });

  describe('concurrency lease', () => {
    it('refuses a second sync while one holds the lease, and frees it after expiry', async () => {
      const t = setup();
      oneRepoWorld(t.world);
      await t.run();
      const nowHold = new Date(NOW.getTime() + 1000);
      expect(await acquireSyncLease(t.db, 10, nowHold)).toBe(true);
      expect(
        await acquireSyncLease(t.db, 10, new Date(nowHold.getTime() + 1000)),
      ).toBe(false);
      expect(
        await acquireSyncLease(
          t.db,
          10,
          new Date(nowHold.getTime() + SYNC_LEASE_MS + 1),
        ),
      ).toBe(true);
    });

    it('a sync that finds the installation locked reports it instead of running', async () => {
      const t = setup();
      oneRepoWorld(t.world);
      await t.run(); // creates the installation row
      await acquireSyncLease(t.db, 10, NOW);
      t.budgetRef.remaining = 200;
      const result = await t.run();
      expect(result.errors).toEqual(['acme: a sync is already running']);
      expect(result.repositoriesSynced).toBe(0);
    });
  });

  it('never sends the installation token anywhere but GitHub, and stores none', async () => {
    const t = setup();
    oneRepoWorld(t.world);
    await t.run();
    const dump = JSON.stringify(
      [
        'github_installations',
        'repositories',
        'repository_events',
        'webhook_deliveries',
      ].map((table) => t.rows(`SELECT * FROM ${table}`)),
    );
    expect(dump).not.toContain('ghs_fake');
  });
});
