import { describe, expect, it } from 'vitest';
import { LIMITS } from '../../../shared/automation';
import { ghCommit } from '../../testing/fake-github';
import { automationWorld, MINUTE } from '../../testing/automation-fixtures';
import { push, workflowRun } from '../../testing/webhook-payloads';
import { createEventStoreSink } from '../store/events';
import { processWebhook } from '../webhooks/process';
import {
  combineSinks,
  createAutomationSink,
  prepareManually,
  processDueRuns,
} from './engine';
import { createRuntimeGitHub, resolveGitHubConfig } from '../github/runtime';
import {
  claimDueRuns,
  createManualRun,
  requiredWorkflowIds,
} from '../store/automation';
import {
  getPromptDetail,
  listAutomations,
  listPromptSummaries,
  saveRule,
  updatePromptStatus,
  ServiceError,
  getAutomationDetail,
} from './service';
import {
  parseRepositoryId,
  parseRuleInput,
  parsePrepareInput,
  parsePromptStatus,
  ValidationError,
} from './validate';

interface RunRow {
  id: string;
  status: string;
  reason: string | null;
  sha: string;
  attempts: number;
  trigger: string;
  prompt_id: string | null;
  detail: string | null;
}

async function setup() {
  const w = automationWorld();
  await w.addRepository(100, 'acme/api', { head: 'sha-1' });
  w.follow('ada', 100);
  await w.rule('ada', 100);

  const eventSink = createEventStoreSink(w.db, w.deps.now);
  const sink = combineSinks(eventSink, createAutomationSink(w.db, w.deps.now));
  let n = 0;
  const deliver = (event: string, payload: unknown, id = `d-${++n}`) =>
    processWebhook(
      {
        db: w.db,
        sink,
        now: w.deps.now,
        scheduleSync: () => undefined,
        shouldPrune: () => false,
      },
      { deliveryId: id, event, payload },
    );
  const runs = () =>
    w.rows<RunRow>('SELECT * FROM automation_run ORDER BY created_at, id');
  const prompts = () =>
    w.rows<{
      id: string;
      sha: string;
      trigger: string;
      revision: number;
      ci_bypassed: number;
      status: string;
      user_id: string;
    }>('SELECT * FROM development_prompt ORDER BY created_at, id');
  const tick = () => processDueRuns(w.deps);
  const settle = () => w.advance(121_000);
  /** A default-branch push for `sha`, at the world's clock. */
  const pushSha = (sha: string, extra: Record<string, unknown> = {}) =>
    deliver(
      'push',
      push({
        after: sha,
        commits: [{ id: sha }],
        head_commit: {
          id: sha,
          message: `feat: ${sha}`,
          timestamp: w.clock.now.toISOString(),
          author: { username: 'ada' },
        },
        ...extra,
      }),
    );
  /** The mirror (and GitHub) head moves to `sha`. */
  const moveGitHubHead = (sha: string) => {
    const state = w.states.get(100);
    if (state) state.commit = ghCommit(sha);
  };
  return {
    ...w,
    deliver,
    runs,
    prompts,
    tick,
    settle,
    pushSha,
    moveGitHubHead,
  };
}
type T = Awaited<ReturnType<typeof setup>>;

/** push sha-1 -> settle -> a successful CI run for it. */
async function pushedAndGreen(t: T, sha = 'sha-1') {
  await t.pushSha(sha);
  await t.mirrorRun(100, 1, { head_sha: sha });
  t.settle();
}

describe('triggers (webhook -> durable run)', () => {
  it('a default-branch push creates exactly one pending run bound to repository, branch and SHA', async () => {
    const t = await setup();
    await t.pushSha('sha-1');
    expect(t.runs()).toHaveLength(1);
    expect(t.runs()[0]).toMatchObject({
      status: 'pending',
      sha: 'sha-1',
      trigger: 'automatic',
      reason: 'settling',
    });
    const run = t.rows<{
      repository_id: number;
      branch: string;
      user_id: string;
      push_commits: number;
    }>('SELECT * FROM automation_run')[0];
    expect(run).toMatchObject({
      repository_id: 100,
      branch: 'main',
      user_id: 'ada',
      push_commits: 1,
    });
  });

  it('following a repository alone triggers nothing; disabled or unfollowed rules neither', async () => {
    const t = await setup();
    await t.addRepository(101, 'acme/web');
    t.follow('ada', 101); // followed, no rule
    await t.deliver(
      'push',
      push({
        repository: {
          id: 101,
          name: 'web',
          full_name: 'acme/web',
          default_branch: 'main',
          html_url: 'https://github.com/acme/web',
          owner: { login: 'acme' },
        },
        after: 'sha-9',
        head_commit: {
          id: 'sha-9',
          message: 'x',
          timestamp: t.clock.now.toISOString(),
        },
      }),
    );
    expect(t.runs()).toHaveLength(0);

    await t.rule('ada', 100, { enabled: false });
    await t.pushSha('sha-2');
    expect(t.runs()).toHaveLength(0);

    await t.rule('ada', 100, { enabled: true });
    t.unfollow('ada', 100);
    await t.pushSha('sha-3');
    expect(t.runs()).toHaveLength(0);
  });

  it('ignores pushes to other branches and deleted branches', async () => {
    const t = await setup();
    await t.pushSha('sha-f', { ref: 'refs/heads/feature/x' });
    await t.pushSha('sha-d', { deleted: true });
    expect(t.runs()).toHaveLength(0);
  });

  it('a redelivered webhook and a second delivery for the same commit create no second run', async () => {
    const t = await setup();
    await t.deliver(
      'push',
      push({
        after: 'sha-1',
        head_commit: {
          id: 'sha-1',
          message: 'x',
          timestamp: t.clock.now.toISOString(),
        },
      }),
      'same',
    );
    expect(await t.deliver('push', push({ after: 'sha-1' }), 'same')).toEqual({
      result: 'duplicate',
    });
    await t.pushSha('sha-1'); // a different delivery id, same commit
    expect(t.runs()).toHaveLength(1);
  });

  it('records one run per user who enabled a rule, isolated by owner', async () => {
    const t = await setup();
    t.follow('bob', 100);
    await t.rule('bob', 100);
    await t.pushSha('sha-1');
    expect(t.runs()).toHaveLength(2);
    expect(
      t
        .rows<{
          user_id: string;
        }>('SELECT user_id FROM automation_run ORDER BY user_id')
        .map((r) => r.user_id),
    ).toEqual(['ada', 'bob']);
  });

  it('a newer commit supersedes the older pending run', async () => {
    const t = await setup();
    await t.pushSha('sha-1');
    t.advance(60_000);
    await t.pushSha('sha-2');
    const runs = t.runs();
    expect(runs.map((r) => [r.sha, r.status])).toEqual([
      ['sha-1', 'superseded'],
      ['sha-2', 'pending'],
    ]);
    expect(runs[0].reason).toBe('newer_commit');
  });

  it('a late, older push redelivery never becomes a candidate or supersedes the newer one', async () => {
    const t = await setup();
    const early = new Date(t.clock.now.getTime() - 3600_000).toISOString();
    await t.pushSha('sha-2');
    await t.deliver(
      'push',
      push({
        after: 'sha-old',
        commits: [{ id: 'sha-old' }],
        head_commit: { id: 'sha-old', message: 'old', timestamp: early },
      }),
    );
    expect(t.runs().map((r) => [r.sha, r.status])).toEqual([
      ['sha-2', 'pending'],
    ]);
  });

  it('a workflow_run webhook only wakes the run; a run that finished before the push still counts', async () => {
    const t = await setup();
    await t.mirrorRun(100, 1, { head_sha: 'sha-1' }); // CI webhook arrived first
    await t.pushSha('sha-1');
    expect((await t.tick()).claimed).toBe(0); // settling
    t.settle();
    expect((await t.tick()).succeeded).toBe(1);
  });
});

describe('processing and the CI gate', () => {
  it('prepares exactly one prompt after the settle period when CI is green', async () => {
    const t = await setup();
    await pushedAndGreen(t);
    expect(await t.tick()).toMatchObject({ claimed: 1, succeeded: 1 });
    expect(t.prompts()).toHaveLength(1);
    expect(t.prompts()[0]).toMatchObject({
      sha: 'sha-1',
      trigger: 'automatic',
      revision: 1,
      ci_bypassed: 0,
      status: 'unread',
    });
    expect(t.runs()[0]).toMatchObject({
      status: 'succeeded',
      reason: 'prepared',
    });
    expect(t.runs()[0].prompt_id).toBe(t.prompts()[0].id);

    // Ticks, replays and redeliveries add nothing.
    expect((await t.tick()).claimed).toBe(0);
    await t.pushSha('sha-1');
    t.settle();
    await t.tick();
    expect(t.prompts()).toHaveLength(1);
    expect(
      t.rows<{ last_prepared_sha: string }>(
        'SELECT last_prepared_sha FROM automation_rule',
      )[0].last_prepared_sha,
    ).toBe('sha-1');
  });

  it('is not due before the settle period', async () => {
    const t = await setup();
    await t.pushSha('sha-1');
    await t.mirrorRun(100, 1, { head_sha: 'sha-1' });
    t.advance(60_000);
    expect((await t.tick()).claimed).toBe(0);
    expect(t.prompts()).toHaveLength(0);
  });

  it('waits while a workflow is still running, then prepares when it succeeds (webhook wakes it)', async () => {
    const t = await setup();
    await t.pushSha('sha-1');
    await t.mirrorRun(100, 1, { head_sha: 'sha-1' });
    await t.mirrorRun(100, 2, {
      head_sha: 'sha-1',
      status: 'in_progress',
      conclusion: null,
    });
    t.settle();
    expect(await t.tick()).toMatchObject({ waiting: 1, succeeded: 0 });
    expect(t.runs()[0]).toMatchObject({
      status: 'pending',
      reason: 'workflow_running',
    });
    expect(t.prompts()).toHaveLength(0);

    // Not due again for ~5 minutes on its own...
    expect((await t.tick()).claimed).toBe(0);
    // ...but the workflow_run webhook pulls it forward.
    await t.deliver(
      'workflow_run',
      workflowRun('completed', {
        id: 2,
        workflow_id: 2,
        name: 'wf-2',
        head_sha: 'sha-1',
        created_at: t.clock.now.toISOString(),
        updated_at: new Date(t.clock.now.getTime() + 1000).toISOString(),
      }),
    );
    t.advance(2000);
    expect((await t.tick()).succeeded).toBe(1);
  });

  it('a failing workflow blocks automatic preparation, and a rerun that passes unblocks it', async () => {
    const t = await setup();
    await t.pushSha('sha-1');
    await t.mirrorRun(100, 1, { head_sha: 'sha-1', conclusion: 'failure' });
    t.settle();
    await t.tick();
    expect(t.runs()[0]).toMatchObject({
      status: 'pending',
      reason: 'workflow_failed',
    });
    expect(t.prompts()).toHaveLength(0);

    // The rerun reuses the run id with a higher attempt and a later update.
    t.advance(MINUTE);
    await t.mirrorRun(100, 1, {
      head_sha: 'sha-1',
      conclusion: 'success',
      run_attempt: 2,
      created_at: new Date(t.clock.now.getTime() - MINUTE).toISOString(),
      updated_at: t.clock.now.toISOString(),
    });
    await t.deliver(
      'workflow_run',
      workflowRun('completed', {
        id: 1,
        workflow_id: 1,
        name: 'wf-1',
        head_sha: 'sha-1',
        conclusion: 'success',
        run_attempt: 2,
        updated_at: new Date(t.clock.now.getTime() + 1).toISOString(),
      }),
    );
    t.advance(5000);
    await t.tick();
    expect(t.prompts()).toHaveLength(1);
  });

  it('a success from an older SHA does not count for the new one', async () => {
    const t = await setup();
    await t.mirrorRun(100, 1, { head_sha: 'sha-OLD' });
    await t.pushSha('sha-1');
    t.settle();
    await t.tick();
    expect(t.runs()[0]).toMatchObject({
      status: 'pending',
      reason: 'waiting_for_runs',
    });
    expect(t.prompts()).toHaveLength(0);
  });

  it('pull-request workflow runs for the same SHA do not satisfy the gate', async () => {
    const t = await setup();
    await t.mirrorRun(100, 1, { head_sha: 'sha-1', event: 'pull_request' });
    await t.pushSha('sha-1');
    t.settle();
    await t.tick();
    expect(t.prompts()).toHaveLength(0);
  });

  it('no CI at all is never success: it reads "no CI" after the grace period', async () => {
    const t = await setup();
    await t.pushSha('sha-1');
    t.advance((LIMITS.ciGraceMinutes + 1) * MINUTE);
    await t.tick();
    expect(t.runs()[0]).toMatchObject({ status: 'pending', reason: 'no_ci' });
    expect(t.prompts()).toHaveLength(0);
  });

  it('required workflows: a missing one blocks, all present and green prepares', async () => {
    const t = await setup();
    await t.rule('ada', 100, {
      ciPolicy: 'required_workflows',
      requiredWorkflowIds: [1, 2],
    });
    await t.pushSha('sha-1');
    await t.mirrorRun(100, 1, { head_sha: 'sha-1' });
    t.advance((LIMITS.ciGraceMinutes + 1) * MINUTE);
    await t.tick();
    expect(t.runs()[0]).toMatchObject({
      status: 'pending',
      reason: 'workflow_missing',
    });
    expect(t.runs()[0].detail).toContain('wf-2'.replace('wf-2', 'Workflow #2'));

    await t.mirrorRun(100, 2, { head_sha: 'sha-1' });
    await t.deliver(
      'workflow_run',
      workflowRun('completed', {
        id: 2,
        workflow_id: 2,
        head_sha: 'sha-1',
        updated_at: new Date(t.clock.now.getTime() + 1).toISOString(),
      }),
    );
    t.advance(2000);
    await t.tick();
    expect(t.prompts()).toHaveLength(1);
  });

  it('a run waiting beyond its expiry is expired, keeping a blocking reason', async () => {
    const t = await setup();
    await t.pushSha('sha-1');
    await t.mirrorRun(100, 1, { head_sha: 'sha-1', conclusion: 'failure' });
    t.settle();
    await t.tick();
    t.advance((LIMITS.runExpiryHours + 1) * 60 * MINUTE);
    await t.tick();
    expect(t.runs()[0]).toMatchObject({
      status: 'expired',
      reason: 'workflow_failed',
    });
  });

  it('heals a missed workflow_run webhook by reading that commit’s runs from GitHub', async () => {
    const t = await setup();
    await t.pushSha('sha-1');
    const state = t.states.get(100);
    if (state) {
      state.runs = [
        {
          id: 77,
          workflow_id: 7,
          name: 'CI',
          event: 'push',
          head_branch: 'main',
          head_sha: 'sha-1',
          status: 'completed',
          conclusion: 'success',
          run_number: 1,
          run_attempt: 1,
          html_url: 'https://github.com/acme/api/actions/runs/77',
          created_at: t.clock.now.toISOString(),
          updated_at: t.clock.now.toISOString(),
        },
      ];
    }
    t.settle();
    await t.tick();
    expect(t.prompts()).toHaveLength(0); // too early to distrust the mirror
    t.advance(11 * MINUTE);
    await t.tick();
    expect(t.fake.calls).toContain('GET /repos/acme/api/actions/runs');
    expect(t.prompts()).toHaveLength(1);
  });

  it('respects the cooldown between automatic preparations', async () => {
    const t = await setup();
    await t.rule('ada', 100, { cooldownMinutes: 60 });
    await pushedAndGreen(t, 'sha-1');
    await t.tick();
    expect(t.prompts()).toHaveLength(1);

    t.advance(MINUTE);
    t.moveGitHubHead('sha-2');
    await t.pushSha('sha-2');
    await t.mirrorRun(100, 2, { head_sha: 'sha-2' });
    t.settle();
    await t.tick();
    expect(t.prompts()).toHaveLength(1);
    expect(t.runs()[1]).toMatchObject({
      status: 'pending',
      reason: 'cooldown',
    });

    t.advance(61 * MINUTE);
    await t.tick();
    expect(t.prompts()).toHaveLength(2);
  });

  it('supersedes when the branch moved on GitHub even though no push webhook arrived', async () => {
    const t = await setup();
    await pushedAndGreen(t);
    t.moveGitHubHead('sha-NEWER');
    await t.tick();
    expect(t.runs()[0]).toMatchObject({
      status: 'superseded',
      reason: 'newer_commit',
    });
    expect(t.prompts()).toHaveLength(0);
  });

  it('skips with a reason when the rule is disabled or the repository unfollowed — history is kept', async () => {
    const t = await setup();
    await pushedAndGreen(t, 'sha-1');
    await t.tick();
    expect(t.prompts()).toHaveLength(1);

    t.moveGitHubHead('sha-2');
    await t.pushSha('sha-2');
    await t.mirrorRun(100, 2, { head_sha: 'sha-2' });
    t.settle();
    t.unfollow('ada', 100);
    await t.tick();
    expect(t.runs()[1]).toMatchObject({
      status: 'skipped',
      reason: 'not_followed',
    });

    // Rule configuration survives; the old prompt is still there.
    expect(requiredWorkflowIds(await t.rule('ada', 100))).toEqual([]);
    expect(t.prompts()).toHaveLength(1);

    t.follow('ada', 100);
    t.moveGitHubHead('sha-3');
    await t.pushSha('sha-3');
    await t.rule('ada', 100, { enabled: false });
    t.settle();
    await t.tick();
    expect(t.runs()[2]).toMatchObject({
      status: 'skipped',
      reason: 'rule_disabled',
    });
  });

  it('fails clearly when the GitHub App is not configured', async () => {
    const t = await setup();
    await pushedAndGreen(t);
    const result = await processDueRuns({ ...t.deps, github: null });
    expect(result.ended).toBe(1);
    expect(t.runs()[0]).toMatchObject({
      status: 'failed',
      reason: 'github_not_configured',
    });
  });
});

describe('durability, retries and concurrency', () => {
  it('retries transient GitHub failures with backoff and gives up after the attempt limit', async () => {
    const t = await setup();
    await pushedAndGreen(t);
    t.world.failures['/repos/acme/api/commits/main'] = () =>
      new Response('{}', { status: 502 });
    await t.tick();
    expect(t.runs()[0]).toMatchObject({
      status: 'pending',
      attempts: 1,
      reason: 'github_unavailable',
    });

    // Not due immediately...
    expect((await t.tick()).claimed).toBe(0);
    // ...but is after the backoff, and so on until the limit.
    for (let i = 1; i < LIMITS.maxAttempts; i++) {
      t.advance(31 * MINUTE);
      await t.tick();
    }
    expect(t.runs()[0]).toMatchObject({
      status: 'failed',
      attempts: LIMITS.maxAttempts,
    });
    expect(t.runs()[0].detail).toContain('Gave up');
    t.advance(31 * MINUTE);
    expect((await t.tick()).claimed).toBe(0); // never retried forever
  });

  it('recovers after the failure clears', async () => {
    const t = await setup();
    await pushedAndGreen(t);
    t.world.failures['/repos/acme/api/commits/main'] = () =>
      new Response('{}', { status: 500 });
    await t.tick();
    delete t.world.failures['/repos/acme/api/commits/main'];
    t.advance(31 * MINUTE);
    await t.tick();
    expect(t.prompts()).toHaveLength(1);
    expect(t.runs()[0].status).toBe('succeeded');
  });

  it('a rate limit delays the retry until the reset instead of hammering GitHub', async () => {
    const t = await setup();
    await pushedAndGreen(t);
    const reset = Math.floor((t.clock.now.getTime() + 40 * MINUTE) / 1000);
    t.world.failures['/repos/acme/api/commits/main'] = () =>
      new Response('{}', {
        status: 403,
        headers: {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(reset),
        },
      });
    await t.tick();
    const next = t.rows<{ next_check_at: string }>(
      'SELECT next_check_at FROM automation_run',
    )[0].next_check_at;
    expect(Date.parse(next) - t.clock.now.getTime()).toBeGreaterThanOrEqual(
      39 * MINUTE,
    );
  });

  it('revoked access fails once, with an explanation, and does not retry', async () => {
    const t = await setup();
    await pushedAndGreen(t);
    t.world.failures['/app/installations/10/access_tokens'] = () =>
      new Response('{}', { status: 404 });
    await t.tick();
    expect(t.runs()[0]).toMatchObject({
      status: 'failed',
      reason: 'access_revoked',
      attempts: 0,
    });
  });

  it('an exhausted request budget is retried later, not lost', async () => {
    const t = await setup();
    await pushedAndGreen(t);
    t.budget.remaining = 0;
    await t.tick();
    expect(t.runs()[0]).toMatchObject({ status: 'pending', attempts: 1 });
    t.budget.remaining = 100;
    t.advance(31 * MINUTE);
    await t.tick();
    expect(t.prompts()).toHaveLength(1);
  });

  it('a processor that died mid-run loses nothing: the lease expires and the run completes', async () => {
    const t = await setup();
    await pushedAndGreen(t);
    // "Crash": claim the run and never settle it.
    const claimed = await claimDueRuns(t.db, 1, t.clock.now);
    expect(claimed).toHaveLength(1);
    expect(t.runs()[0].status).toBe('running');
    expect((await t.tick()).claimed).toBe(0); // still leased

    t.advance(3 * MINUTE);
    const summary = await t.tick();
    expect(summary.succeeded).toBe(1);
    expect(t.runs()[0]).toMatchObject({ status: 'succeeded', attempts: 1 });
    expect(t.prompts()).toHaveLength(1);
  });

  it('a crash after the prompt was stored but before the run was marked is healed without duplicates', async () => {
    const t = await setup();
    await pushedAndGreen(t);
    await t.tick();
    // Roll the run back to "running with an expired lease", as a crash would leave it.
    t.raw
      .prepare(
        "UPDATE automation_run SET status = 'running', lease_token = 'dead', lease_until = ?, prompt_id = NULL, finished_at = NULL",
      )
      .run(new Date(t.clock.now.getTime() - 1000).toISOString());
    t.advance(MINUTE);
    await t.tick();
    expect(t.prompts()).toHaveLength(1);
    expect(t.runs()[0]).toMatchObject({
      status: 'succeeded',
      prompt_id: t.prompts()[0].id,
    });
  });

  it('concurrent processors claim a run once and produce one prompt', async () => {
    const t = await setup();
    await pushedAndGreen(t);
    const [a, b, c] = await Promise.all([t.tick(), t.tick(), t.tick()]);
    expect(a.claimed + b.claimed + c.claimed).toBe(1);
    expect(t.prompts()).toHaveLength(1);
  });

  it('processes a bounded number of runs per tick', async () => {
    const t = await setup();
    for (let id = 101; id <= 106; id++) {
      await t.addRepository(id, `acme/r${id}`, { head: `s${id}` });
      t.follow('ada', id);
      await t.rule('ada', id);
      t.raw
        .prepare(
          "INSERT INTO automation_run (id, rule_id, user_id, repository_id, repository_full_name, branch, sha, trigger, status, attempts, not_before, next_check_at, expires_at, created_at, updated_at) SELECT ?, id, 'ada', ?, ?, 'main', ?, 'automatic', 'pending', 0, ?, ?, ?, ?, ? FROM automation_rule WHERE repository_id = ?",
        )
        .run(
          `r-${id}`,
          id,
          `acme/r${id}`,
          `s${id}`,
          t.clock.now.toISOString(),
          t.clock.now.toISOString(),
          new Date(t.clock.now.getTime() + 1e9).toISOString(),
          t.clock.now.toISOString(),
          t.clock.now.toISOString(),
          id,
        );
    }
    t.advance(MINUTE);
    expect((await t.tick()).claimed).toBe(3);
    // Three were advanced (they now carry a reason); the rest still wait.
    expect(t.runs().filter((r) => r.reason !== null)).toHaveLength(3);
  });

  it('never reads or writes GitHub with anything but GET (plus the token exchange) and never leaks the token', async () => {
    const t = await setup();
    await pushedAndGreen(t);
    await t.tick();
    const writes = t.fake.calls.filter((c) => !c.startsWith('GET '));
    expect(
      writes.every(
        (c) =>
          c.startsWith('POST /app/installations/') &&
          c.endsWith('/access_tokens'),
      ),
    ).toBe(true);
    const stored =
      JSON.stringify(t.rows('SELECT * FROM development_prompt')) +
      JSON.stringify(t.rows('SELECT * FROM automation_run'));
    expect(stored).not.toContain('ghs_fake');
    expect(stored).not.toContain('PRIVATE KEY');
  });
});

describe('manual preparation', () => {
  const manual = (t: T, bypassCi = false, user = 'ada') =>
    prepareManually(t.deps, { userId: user, repositoryId: 100, bypassCi });

  it('prepares for the current head without a rule, a follow, or automation enabled', async () => {
    const t = await setup();
    await t.rule('ada', 100, { enabled: false });
    t.unfollow('ada', 100);
    await t.mirrorRun(100, 1, { head_sha: 'sha-1' });
    const result = await manual(t);
    expect(result).toMatchObject({ ok: true, sha: 'sha-1' });
    expect(t.prompts()).toMatchObject([
      { trigger: 'manual', revision: 1, ci_bypassed: 0 },
    ]);
    expect(t.runs()[0]).toMatchObject({
      trigger: 'manual',
      status: 'succeeded',
    });
  });

  it('repeating it makes a clearly separate manual revision, never an overwrite', async () => {
    const t = await setup();
    await t.mirrorRun(100, 1, { head_sha: 'sha-1' });
    await manual(t);
    t.advance(MINUTE);
    await manual(t);
    expect(t.prompts().map((p) => p.revision)).toEqual([1, 2]);
  });

  it('uses the commit GitHub reports now, not a stale mirror', async () => {
    const t = await setup();
    t.moveGitHubHead('sha-fresh');
    await t.mirrorRun(100, 1, { head_sha: 'sha-fresh' });
    expect(await manual(t)).toMatchObject({ ok: true, sha: 'sha-fresh' });
  });

  it('refuses when CI is not passing unless the user explicitly bypasses it — and records the bypass', async () => {
    const t = await setup();
    await t.mirrorRun(100, 1, { head_sha: 'sha-1', conclusion: 'failure' });
    const refused = await manual(t);
    expect(refused).toMatchObject({ ok: false, code: 'ci_not_passing' });
    expect(refused.ok === false && refused.gate?.reason).toBe(
      'workflow_failed',
    );
    expect(t.prompts()).toHaveLength(0);

    const bypassed = await manual(t, true);
    expect(bypassed.ok).toBe(true);
    expect(t.prompts()[0]).toMatchObject({ trigger: 'manual', ci_bypassed: 1 });
    const prompt = t.rows<{ prompt: string }>(
      'SELECT prompt FROM development_prompt',
    )[0].prompt;
    expect(prompt).toContain('The CI check was explicitly bypassed');
  });

  it('a repository without CI needs the bypass — and says so', async () => {
    const t = await setup();
    const refused = await manual(t);
    expect(refused).toMatchObject({ ok: false, code: 'ci_not_passing' });
    expect(refused.ok === false && refused.message).toContain('without CI');
    expect((await manual(t, true)).ok).toBe(true);
  });

  it('a bypass flag on a passing commit is not recorded as a bypass', async () => {
    const t = await setup();
    await t.mirrorRun(100, 1, { head_sha: 'sha-1' });
    await manual(t, true);
    expect(t.prompts()[0].ci_bypassed).toBe(0);
  });

  it('rejects a second submission while one is in flight', async () => {
    const t = await setup();
    await t.mirrorRun(100, 1, { head_sha: 'sha-1' });
    await createManualRun(
      t.db,
      {
        userId: 'ada',
        ruleId: null,
        repositoryId: 100,
        repositoryFullName: 'acme/api',
        branch: 'main',
        sha: 'sha-1',
        ciBypassed: false,
      },
      t.clock.now,
    );
    expect(await manual(t)).toMatchObject({
      ok: false,
      code: 'already_running',
    });
    // Another user is not blocked by it.
    expect((await manual(t, false, 'bob')).ok).toBe(true);
  });

  it('a manual run that died is freed once its lease expires', async () => {
    const t = await setup();
    await t.mirrorRun(100, 1, { head_sha: 'sha-1' });
    await createManualRun(
      t.db,
      {
        userId: 'ada',
        ruleId: null,
        repositoryId: 100,
        repositoryFullName: 'acme/api',
        branch: 'main',
        sha: 'sha-1',
        ciBypassed: false,
      },
      t.clock.now,
    );
    t.advance(3 * MINUTE);
    expect((await manual(t)).ok).toBe(true);
    expect(t.runs().map((r) => r.status)).toEqual(['failed', 'succeeded']);
  });

  it('reports unknown repositories, missing configuration and GitHub failures', async () => {
    const t = await setup();
    expect(
      await prepareManually(t.deps, {
        userId: 'ada',
        repositoryId: 999,
        bypassCi: false,
      }),
    ).toMatchObject({ ok: false, code: 'not_found' });
    expect(
      await prepareManually(
        { ...t.deps, github: null },
        { userId: 'ada', repositoryId: 100, bypassCi: false },
      ),
    ).toMatchObject({ ok: false, code: 'github_not_configured' });

    await t.mirrorRun(100, 1, { head_sha: 'sha-1' });
    t.world.failures['/repos/acme/api/commits/sha-1'] = () =>
      new Response('{}', { status: 500 });
    const failed = await manual(t);
    expect(failed).toMatchObject({ ok: false, code: 'github_unavailable' });
    expect(t.runs().at(-1)).toMatchObject({ status: 'failed' });
    // The failed run does not block a retry.
    delete t.world.failures['/repos/acme/api/commits/sha-1'];
    expect((await manual(t)).ok).toBe(true);
  });

  it('turns an unreadable/revoked repository into a clear failure', async () => {
    const t = await setup();
    t.world.failures['/app/installations/10/access_tokens'] = () =>
      new Response('{}', { status: 403 });
    expect(await manual(t)).toMatchObject({
      ok: false,
      code: 'access_revoked',
    });
  });

  it('a push with several commits still binds to the head SHA', async () => {
    const t = await setup();
    await t.pushSha('sha-1', {
      commits: [{ id: 'a' }, { id: 'b' }, { id: 'sha-1' }],
    });
    expect(
      t.rows<{ sha: string; push_commits: number }>(
        'SELECT sha, push_commits FROM automation_run',
      )[0],
    ).toEqual({ sha: 'sha-1', push_commits: 3 });
  });
});

describe('rules, prompts and isolation (service layer)', () => {
  const input = {
    enabled: true,
    ciPolicy: 'all_workflows' as const,
    requiredWorkflowIds: [],
    settleSeconds: 120,
    cooldownMinutes: 0,
    chatgptUrl: null,
  };

  it('enabling needs a followed, known repository; disabling does not', async () => {
    const t = await setup();
    await t.addRepository(101, 'acme/web');
    await expect(saveRule(t.db, 'ada', 101, input)).rejects.toMatchObject({
      status: 409,
      code: 'not_followed',
    });
    await expect(saveRule(t.db, 'ada', 999, input)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      saveRule(t.db, 'ada', 101, { ...input, enabled: false }),
    ).resolves.toMatchObject({ enabled: false, state: 'disabled' });
    t.follow('ada', 101);
    await expect(saveRule(t.db, 'ada', 101, input)).resolves.toMatchObject({
      enabled: true,
      state: 'waiting_update',
      branch: 'main',
    });
  });

  it('lists each user’s own rules and eligible repositories only', async () => {
    const t = await setup();
    await t.addRepository(101, 'acme/web');
    t.follow('ada', 101);
    const ada = await listAutomations(t.db, 'ada', true);
    expect(ada.rules.map((r) => r.repositoryFullName)).toEqual(['acme/api']);
    expect(ada.eligible.map((r) => r.fullName)).toEqual(['acme/web']);
    const bob = await listAutomations(t.db, 'bob', true);
    expect(bob.rules).toEqual([]);
    expect(bob.eligible).toEqual([]);
    expect((await getAutomationDetail(t.db, 'bob', 100, true)).rule).toBeNull();
  });

  it('shows the derived state: unfollowing disables, a blocked CI is "blocked", ready after preparing', async () => {
    const t = await setup();
    await t.pushSha('sha-1');
    await t.mirrorRun(100, 1, { head_sha: 'sha-1', conclusion: 'failure' });
    t.settle();
    await t.tick();
    expect((await listAutomations(t.db, 'ada', true)).rules[0].state).toBe(
      'blocked',
    );
    await t.mirrorRun(100, 1, {
      head_sha: 'sha-1',
      conclusion: 'success',
      updated_at: new Date(t.clock.now.getTime() + 1).toISOString(),
    });
    t.advance(6 * MINUTE);
    await t.tick();
    expect((await listAutomations(t.db, 'ada', true)).rules[0].state).toBe(
      'ready',
    );
    t.unfollow('ada', 100);
    expect((await listAutomations(t.db, 'ada', true)).rules[0].state).toBe(
      'disabled',
    );
  });

  it('keeps a rule whose repository left the installation, flagged unavailable', async () => {
    const t = await setup();
    t.raw.exec('PRAGMA foreign_keys = OFF');
    t.raw.exec('DELETE FROM repositories WHERE id = 100');
    const rule = (await listAutomations(t.db, 'ada', true)).rules[0];
    expect(rule).toMatchObject({
      repositoryAvailable: false,
      state: 'disabled',
      enabled: true,
      repositoryId: 100,
    });
  });

  it('prompts are private to their owner: list, read and status changes', async () => {
    const t = await setup();
    await t.mirrorRun(100, 1, { head_sha: 'sha-1' });
    const made = await prepareManually(t.deps, {
      userId: 'ada',
      repositoryId: 100,
      bypassCi: false,
    });
    if (!made.ok) throw new Error('setup failed');

    expect((await listPromptSummaries(t.db, 'ada', {})).prompts).toHaveLength(
      1,
    );
    expect((await listPromptSummaries(t.db, 'bob', {})).prompts).toEqual([]);
    await expect(
      getPromptDetail(t.db, 'bob', made.promptId),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      updatePromptStatus(t.db, 'bob', made.promptId, 'dismissed'),
    ).rejects.toBeInstanceOf(ServiceError);
    expect(t.prompts()[0].status).toBe('unread');

    const detail = await getPromptDetail(t.db, 'ada', made.promptId);
    expect(detail).toMatchObject({
      repositoryFullName: 'acme/api',
      sha: 'sha-1',
      commitUrl: 'https://github.com/acme/api/commit/sha-1',
    });
    expect(detail.prompt).toContain('acme/api');
    expect(detail.context.documents.length).toBeGreaterThan(0);
  });

  it('read / dismissed state filters the inbox', async () => {
    const t = await setup();
    await t.mirrorRun(100, 1, { head_sha: 'sha-1' });
    const a = await prepareManually(t.deps, {
      userId: 'ada',
      repositoryId: 100,
      bypassCi: false,
    });
    const b = await prepareManually(t.deps, {
      userId: 'ada',
      repositoryId: 100,
      bypassCi: false,
    });
    if (!a.ok || !b.ok) throw new Error('setup failed');

    expect((await listPromptSummaries(t.db, 'ada', {})).unread).toBe(2);
    await updatePromptStatus(t.db, 'ada', a.promptId, 'read');
    await updatePromptStatus(t.db, 'ada', b.promptId, 'dismissed');
    expect(
      (await listPromptSummaries(t.db, 'ada', {})).prompts.map((p) => p.id),
    ).toEqual([a.promptId]);
    expect(
      (
        await listPromptSummaries(t.db, 'ada', { status: 'dismissed' })
      ).prompts.map((p) => p.id),
    ).toEqual([b.promptId]);
    expect(
      (await listPromptSummaries(t.db, 'ada', { status: 'unread' })).prompts,
    ).toEqual([]);
    expect(
      (await listPromptSummaries(t.db, 'ada', { repositoryId: 5 })).prompts,
    ).toEqual([]);
    expect((await listPromptSummaries(t.db, 'ada', {})).unread).toBe(0);
  });

  it('exposes the optional ChatGPT link only from the owner’s own rule', async () => {
    const t = await setup();
    await t.rule('ada', 100, { chatgptUrl: 'https://chatgpt.com/c/abc' });
    await t.mirrorRun(100, 1, { head_sha: 'sha-1' });
    const made = await prepareManually(t.deps, {
      userId: 'ada',
      repositoryId: 100,
      bypassCi: false,
    });
    if (!made.ok) throw new Error('setup failed');
    expect((await getPromptDetail(t.db, 'ada', made.promptId)).chatgptUrl).toBe(
      'https://chatgpt.com/c/abc',
    );
  });

  it('keeps only the newest prompts per user (retention)', async () => {
    const t = await setup();
    await t.mirrorRun(100, 1, { head_sha: 'sha-1' });
    for (let i = 0; i < 3; i++)
      await prepareManually(t.deps, {
        userId: 'ada',
        repositoryId: 100,
        bypassCi: false,
      });
    expect(t.prompts()).toHaveLength(3);
  });
});

describe('request validation', () => {
  const ok = { enabled: true, ciPolicy: 'all_workflows' };
  it('accepts a minimal rule and applies defaults', () => {
    expect(parseRuleInput(ok)).toEqual({
      enabled: true,
      ciPolicy: 'all_workflows',
      requiredWorkflowIds: [],
      settleSeconds: 120,
      cooldownMinutes: 0,
      chatgptUrl: null,
    });
  });
  it.each([
    [null],
    [[]],
    ['x'],
    [{}],
    [{ ...ok, enabled: 'yes' }],
    [{ ...ok, ciPolicy: 'whatever' }],
    [{ ...ok, ciPolicy: 'required_workflows' }],
    [{ ...ok, requiredWorkflowIds: [1.5] }],
    [{ ...ok, requiredWorkflowIds: ['1'] }],
    [
      {
        ...ok,
        requiredWorkflowIds: Array.from({ length: 11 }, (_, i) => i + 1),
      },
    ],
    [{ ...ok, settleSeconds: -1 }],
    [{ ...ok, settleSeconds: 99999 }],
    [{ ...ok, cooldownMinutes: 1.2 }],
    [{ ...ok, branch: 'develop' }],
    [{ ...ok, chatgptUrl: 'http://chatgpt.com/c/1' }],
    [{ ...ok, chatgptUrl: 'javascript:alert(1)' }],
    [{ ...ok, extra: 1 }],
  ])('rejects %j', (body) => {
    expect(() => parseRuleInput(body)).toThrow(ValidationError);
  });
  it('dedupes workflow ids and normalizes the ChatGPT URL', () => {
    expect(
      parseRuleInput({
        ...ok,
        ciPolicy: 'required_workflows',
        requiredWorkflowIds: [3, 3, 4],
        chatgptUrl: 'https://chatgpt.com/c/x#frag',
      }),
    ).toMatchObject({
      requiredWorkflowIds: [3, 4],
      chatgptUrl: 'https://chatgpt.com/c/x',
    });
  });
  it('validates repository ids, prepare bodies and prompt status', () => {
    expect(parseRepositoryId('123')).toBe(123);
    for (const bad of [
      undefined,
      '',
      '0',
      '012',
      '-1',
      '1e3',
      'abc',
      '9'.repeat(16),
      '1;DROP',
    ]) {
      expect(() => parseRepositoryId(bad)).toThrow(ValidationError);
    }
    expect(parsePrepareInput(undefined)).toEqual({ bypassCi: false });
    expect(parsePrepareInput({ bypassCi: true })).toEqual({ bypassCi: true });
    expect(() => parsePrepareInput({ bypassCi: 'true' })).toThrow(
      ValidationError,
    );
    expect(() => parsePrepareInput({ x: 1 })).toThrow(ValidationError);
    expect(parsePromptStatus({ status: 'read' })).toBe('read');
    expect(() => parsePromptStatus({ status: 'deleted' })).toThrow(
      ValidationError,
    );
    expect(() => parsePromptStatus(null)).toThrow(ValidationError);
  });
});

describe('GitHub runtime configuration', () => {
  it('only honors an https or local-http API base URL', () => {
    const base = (value: string) =>
      resolveGitHubConfig({
        cloudflare: { env: { GITHUB_API_BASE_URL: value } },
      }).apiBaseUrl;
    expect(base('http://127.0.0.1:4410')).toBe('http://127.0.0.1:4410');
    expect(base('https://ghe.example.com')).toBe('https://ghe.example.com');
    expect(base('http://evil.example.com')).toBeUndefined();
    expect(base('ftp://localhost')).toBeUndefined();
    expect(base('not a url')).toBeUndefined();
    expect(
      createRuntimeGitHub({
        appId: undefined,
        slug: undefined,
        privateKey: undefined,
        webhookSecret: undefined,
        requestBudget: 1,
        apiBaseUrl: undefined,
      }),
    ).toBeNull();
  });
});
