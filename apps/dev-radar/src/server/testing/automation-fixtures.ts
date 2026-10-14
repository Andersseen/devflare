import { createGitHubApi } from '../lib/github/api';
import {
  mapInstallation,
  mapRepository,
  mapWorkflowRun,
} from '../lib/github/mapping';
import type { RuntimeGitHub } from '../lib/github/runtime';
import type { EngineDeps } from '../lib/automation/engine';
import {
  upsertRule,
  type RuleInput,
  type RuleRow,
} from '../lib/store/automation';
import { upsertInstallation } from '../lib/store/installations';
import { applyHead, upsertRepository } from '../lib/store/repositories';
import { upsertWorkflowRun } from '../lib/store/runs';
import {
  createFakeGitHub,
  emptyWorld,
  ghCommit,
  ghInstallation,
  ghRepo,
  ghRun,
  repoState,
  testPrivateKeyPem,
  type FakeGitHub,
  type FakeRepoState,
  type FakeWorld,
} from './fake-github';
import type { GhWorkflowRun } from '../lib/github/types';
import { createTestDb, NOW } from './test-db';

/**
 * A complete automation world for tests: real migrations on SQLite, two users,
 * one installation, a fake GitHub `fetch` the production GitHubApi runs
 * against, and a clock the test moves by hand.
 */
export function automationWorld() {
  const t = createTestDb();
  const clock = { now: new Date(NOW) };
  const world: FakeWorld = emptyWorld();
  const fake: FakeGitHub = createFakeGitHub(world);
  const budget = { remaining: 1000 };
  const github: RuntimeGitHub = {
    budget,
    api: createGitHubApi({
      appId: '1',
      privateKey: testPrivateKeyPem(),
      fetch: fake.fetch,
      budget,
      sleep: async () => undefined,
    }),
  };
  const deps: EngineDeps = { db: t.db, github, now: () => clock.now };

  const iso = () => clock.now.toISOString();
  for (const user of ['ada', 'bob']) {
    t.raw
      .prepare(
        'INSERT INTO app_user (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(user, `${user}@test.dev`, user, iso(), iso());
  }

  const states = new Map<number, FakeRepoState>();
  const ready = (async () => {
    await upsertInstallation(
      t.db,
      mapInstallation(ghInstallation(10, 'acme')) as never,
      iso(),
    );
  })();
  world.installations = [ghInstallation(10, 'acme')];
  world.repositories[10] = [[]];

  async function addRepository(
    id: number,
    fullName: string,
    options: { head?: string; state?: Partial<FakeRepoState> } = {},
  ) {
    await ready;
    const sha = options.head ?? 'sha-1';
    await upsertRepository(
      t.db,
      mapRepository(ghRepo(id, fullName), 10),
      iso(),
    );
    await applyHead(
      t.db,
      id,
      { sha, message: 'feat: ship', author: 'ada', committedAt: iso() },
      iso(),
    );
    const state = repoState({
      repo: ghRepo(id, fullName),
      commit: ghCommit(sha),
      runs: [],
      files: {
        'README.md': '# Hello\n\nA project.',
        'AGENTS.md': '# Agents\n\nUse pnpm.',
      },
      changedFiles: ['src/a.ts', 'src/b.ts'],
      history: [ghCommit(sha), ghCommit('sha-0', 'chore: before')],
      commitPulls: [
        {
          number: 7,
          title: 'Add thing',
          state: 'closed',
          html_url: `https://github.com/${fullName}/pull/7`,
          body: 'Adds the thing.',
          merged_at: '2026-10-14T09:00:00Z',
          user: { login: 'ada' },
          base: { ref: 'main' },
        },
      ],
      ...options.state,
    });
    states.set(id, state);
    world.repositories[10][0].push(state);
    return state;
  }

  const follow = (user: string, repositoryId: number) =>
    t.raw
      .prepare(
        `INSERT OR REPLACE INTO followed_repository (user_id, repository_id, group_id, position, pinned, created_at)
         VALUES (?, ?, NULL, 0, 0, ?)`,
      )
      .run(user, repositoryId, iso());
  const unfollow = (user: string, repositoryId: number) =>
    t.raw
      .prepare(
        'DELETE FROM followed_repository WHERE user_id = ? AND repository_id = ?',
      )
      .run(user, repositoryId);

  const defaultRule: RuleInput = {
    enabled: true,
    ciPolicy: 'all_workflows',
    requiredWorkflowIds: [],
    settleSeconds: 120,
    cooldownMinutes: 0,
    chatgptUrl: null,
  };
  const rule = (
    user: string,
    repositoryId: number,
    over: Partial<RuleInput> = {},
  ): Promise<RuleRow> =>
    upsertRule(
      t.db,
      user,
      repositoryId,
      { ...defaultRule, ...over },
      clock.now,
    );

  /** Stores a workflow run in the mirror, as a workflow_run webhook would. */
  const mirrorRun = (
    repositoryId: number,
    id: number,
    over: Partial<GhWorkflowRun> = {},
  ) =>
    upsertWorkflowRun(
      t.db,
      mapWorkflowRun(
        ghRun(id, {
          workflow_id: id,
          name: `wf-${id}`,
          created_at: iso(),
          updated_at: iso(),
          ...over,
        }),
        repositoryId,
      ),
    );

  const advance = (ms: number) => {
    clock.now = new Date(clock.now.getTime() + ms);
  };
  const rows = <T>(sql: string, ...values: unknown[]) =>
    t.raw.prepare(sql).all(...values) as T[];

  return {
    ...t,
    clock,
    world,
    fake,
    github,
    budget,
    deps,
    states,
    addRepository,
    follow,
    unfollow,
    rule,
    mirrorRun,
    advance,
    rows,
  };
}

export const MINUTE = 60_000;
