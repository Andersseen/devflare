import {
  LIMITS,
  evaluateCiGate,
  type GateResult,
  type RunReason,
} from '../../../shared/automation';
import type { DomainEventSink } from '../../../shared/domain-events';
import type { SqlDatabase } from '../../db';
import {
  GitHubApiError,
  GitHubRateLimitError,
  RequestBudgetExhaustedError,
} from '../github/errors';
import { mapWorkflowRun } from '../github/mapping';
import type { RuntimeGitHub } from '../github/runtime';
import {
  createAutomaticRun,
  createManualRun,
  expireRuns,
  claimDueRuns,
  getRule,
  getRuleById,
  isFollowing,
  isUniqueViolation,
  listRulesToTrigger,
  listGateRuns,
  listKnownWorkflows,
  markRulePrepared,
  pruneAutomationRuns,
  recoverStaleRuns,
  requiredWorkflowIds,
  settleRun,
  type RuleRow,
  type RunPatch,
  type RunRow,
} from '../store/automation';
import { insertPrompt, prunePrompts } from '../store/prompts';
import { getRepository, type RepositoryRow } from '../store/repositories';
import { upsertWorkflowRun } from '../store/runs';
import { collectContext } from './context';
import { buildPrompt } from './prompt';

/**
 * The automation engine (spec 023): trigger sink, scheduled processor and
 * manual preparation. D1 is the source of truth; nothing here holds state in
 * memory between invocations.
 */

const MINUTE_MS = 60_000;
/** How long a run waits before DevRadar asks GitHub about its CI itself. */
const CI_REFRESH_AFTER_MS = 10 * MINUTE_MS;
const CI_REFRESH_EVERY_MS = 15 * MINUTE_MS;
const RECHECK_MS = 5 * MINUTE_MS;
export const JOBS_PER_RUN = 3;

type Clock = () => Date;

// ---- trigger ---------------------------------------------------------------

/**
 * Turns `repository.main.updated` into pending runs for every enabled rule on
 * that repository whose owner still follows it. Attached to the webhook
 * pipeline only — the reconcile sync publishes to the feed sink alone, so a
 * historical commit it discovers never becomes a development request.
 */
export function createAutomationSink(
  db: SqlDatabase,
  now: Clock = () => new Date(),
): DomainEventSink {
  return {
    async publish(events) {
      for (const event of events) {
        if (
          event.type !== 'repository.main.updated' ||
          event.repositoryId === null
        ) {
          continue;
        }
        const repo = await getRepository(db, event.repositoryId);
        // The mirror knows the newest head: a redelivered or out-of-order older
        // push must not become a candidate.
        if (!repo || repo.head_sha !== event.data.headSha) continue;
        for (const rule of await listRulesToTrigger(db, repo.id)) {
          await createAutomaticRun(
            db,
            {
              rule,
              repositoryFullName: repo.full_name,
              branch: event.data.branch,
              sha: event.data.headSha,
              pushCommits: event.data.commits,
            },
            now(),
          );
        }
      }
    },
  };
}

export function combineSinks(...sinks: DomainEventSink[]): DomainEventSink {
  return {
    async publish(events, deliveryId) {
      for (const sink of sinks) await sink.publish(events, deliveryId);
    },
  };
}

// ---- shared steps ----------------------------------------------------------

export interface EngineDeps {
  db: SqlDatabase;
  /** null = the GitHub App is not configured. */
  github: RuntimeGitHub | null;
  now?: Clock;
}

const clockOf = (deps: EngineDeps): Clock => deps.now ?? (() => new Date());

type TokenCache = Map<number, string>;

async function tokenFor(
  deps: EngineDeps,
  github: RuntimeGitHub,
  installationId: number,
  cache: TokenCache,
): Promise<string> {
  const cached = cache.get(installationId);
  if (cached) return cached;
  const token = await github.api.installationToken(installationId);
  cache.set(installationId, token);
  return token;
}

/** Heals a missed workflow_run webhook: store GitHub's runs of this commit. */
async function refreshCommitRuns(
  deps: EngineDeps,
  github: RuntimeGitHub,
  token: string,
  repo: RepositoryRow,
  sha: string,
): Promise<void> {
  const runs = await github.api.listWorkflowRunsForSha(
    token,
    repo.full_name,
    sha,
  );
  for (const run of runs ?? []) {
    await upsertWorkflowRun(deps.db, mapWorkflowRun(run, repo.id));
  }
}

async function gateFor(
  db: SqlDatabase,
  repo: RepositoryRow,
  branch: string,
  sha: string,
  rule: RuleRow | null,
  ageMs: number,
): Promise<GateResult> {
  const [runs, known] = await Promise.all([
    listGateRuns(db, repo.id, branch, sha),
    listKnownWorkflows(db, repo.id),
  ]);
  return evaluateCiGate({
    runs,
    policy: rule?.ci_policy ?? 'all_workflows',
    requiredWorkflowIds: rule ? requiredWorkflowIds(rule) : [],
    knownNames: new Map(known.map((w) => [w.id, w.name])),
    ageMs,
  });
}

type Failure =
  | { kind: 'retry'; delayMs: number; reason: RunReason; detail: string }
  | { kind: 'fatal'; reason: RunReason; detail: string };

export function classifyFailure(error: unknown, now: Date): Failure {
  if (error instanceof GitHubRateLimitError) {
    const reset = error.resetAt
      ? Date.parse(error.resetAt) - now.getTime()
      : NaN;
    return {
      kind: 'retry',
      delayMs: Number.isFinite(reset)
        ? Math.min(Math.max(reset, MINUTE_MS), 60 * MINUTE_MS)
        : 15 * MINUTE_MS,
      reason: 'github_unavailable',
      detail: 'GitHub rate limit reached; will retry.',
    };
  }
  if (error instanceof RequestBudgetExhaustedError) {
    return {
      kind: 'retry',
      delayMs: RECHECK_MS,
      reason: 'github_unavailable',
      detail: 'The GitHub request budget for this run was spent; will retry.',
    };
  }
  if (error instanceof GitHubApiError) {
    if (error.status === 401) {
      return {
        kind: 'fatal',
        reason: 'github_not_configured',
        detail: 'GitHub rejected the App credentials.',
      };
    }
    if (error.status === 403 || error.status === 404) {
      return {
        kind: 'fatal',
        reason: 'access_revoked',
        detail:
          'GitHub no longer lets the App read this repository (access revoked or repository removed).',
      };
    }
    return {
      kind: 'retry',
      delayMs: 0,
      reason: 'github_unavailable',
      detail: 'GitHub could not be reached or answered with an error.',
    };
  }
  return {
    kind: 'retry',
    delayMs: 0,
    reason: 'preparation_failed',
    detail: 'An unexpected error interrupted the preparation.',
  };
}

const backoffMs = (attempts: number): number =>
  Math.min(30 * MINUTE_MS, 2 * MINUTE_MS * 2 ** Math.max(0, attempts - 1));

function failurePatch(run: RunRow, failure: Failure, now: Date): RunPatch {
  if (failure.kind === 'fatal') {
    return { status: 'failed', reason: failure.reason, detail: failure.detail };
  }
  const attempts = run.attempts + 1;
  if (attempts >= LIMITS.maxAttempts) {
    return {
      status: 'failed',
      reason: failure.reason,
      detail: `${failure.detail} Gave up after ${attempts} attempts.`,
      attempts,
    };
  }
  return {
    status: 'pending',
    reason: failure.reason,
    detail: failure.detail,
    attempts,
    nextCheckAt: new Date(
      now.getTime() + Math.max(failure.delayMs, backoffMs(attempts)),
    ).toISOString(),
  };
}

// ---- processor -------------------------------------------------------------

export interface ProcessSummary {
  claimed: number;
  succeeded: number;
  waiting: number;
  ended: number;
  retried: number;
}

/**
 * One bounded processor tick: recover dead leases, expire stale waits, claim at
 * most `limit` due runs and take each one a step further. Safe to run from the
 * cron and from the webhook's waitUntil at the same time — claims are atomic.
 */
export async function processDueRuns(
  deps: EngineDeps,
  limit: number = JOBS_PER_RUN,
): Promise<ProcessSummary> {
  const clock = clockOf(deps);
  const summary: ProcessSummary = {
    claimed: 0,
    succeeded: 0,
    waiting: 0,
    ended: 0,
    retried: 0,
  };

  await recoverStaleRuns(deps.db, clock());
  await expireRuns(deps.db, clock());

  const claimed = await claimDueRuns(deps.db, limit, clock());
  summary.claimed = claimed.length;
  const tokens: TokenCache = new Map();

  for (const run of claimed) {
    try {
      const outcome = await processRun(deps, run, tokens);
      summary[outcome]++;
    } catch (error) {
      const now = clock();
      const patch = failurePatch(run, classifyFailure(error, now), now);
      await settleRun(deps.db, run, patch, now);
      summary[patch.status === 'pending' ? 'retried' : 'ended']++;
    }
  }

  await pruneAutomationRuns(deps.db, clock());
  return summary;
}

async function processRun(
  deps: EngineDeps,
  run: RunRow,
  tokens: TokenCache,
): Promise<'succeeded' | 'waiting' | 'ended'> {
  const clock = clockOf(deps);
  const now = clock();
  const end = async (
    status: 'skipped' | 'superseded' | 'failed',
    reason: RunReason,
    detail: string,
  ) => {
    await settleRun(deps.db, run, { status, reason, detail }, now);
    return 'ended' as const;
  };

  const rule = run.rule_id ? await getRuleById(deps.db, run.rule_id) : null;
  if (!rule || rule.enabled !== 1) {
    return end('skipped', 'rule_disabled', 'The automation was disabled.');
  }
  if (!(await isFollowing(deps.db, run.user_id, run.repository_id))) {
    return end(
      'skipped',
      'not_followed',
      'The repository is no longer followed, so automatic preparation stopped.',
    );
  }
  const repo = await getRepository(deps.db, run.repository_id);
  if (!repo) {
    return end(
      'skipped',
      'repository_unavailable',
      'The repository is no longer available to DevRadar.',
    );
  }
  if (repo.default_branch !== run.branch) {
    return end(
      'skipped',
      'branch_changed',
      `The default branch changed from ${run.branch} to ${repo.default_branch}.`,
    );
  }
  if (repo.head_sha && repo.head_sha !== run.sha) {
    return end(
      'superseded',
      'newer_commit',
      'A newer commit reached the branch before this one was prepared.',
    );
  }

  const ageMs = now.getTime() - Date.parse(run.created_at);
  let gate = await gateFor(deps.db, repo, run.branch, run.sha, rule, ageMs);

  // The webhook-fed mirror says it is not done: after a while ask GitHub once
  // in a while, in case a workflow_run delivery never arrived.
  const refreshedAt = run.ci_refreshed_at ? Date.parse(run.ci_refreshed_at) : 0;
  let refreshed: string | undefined;
  if (
    gate.verdict !== 'pass' &&
    deps.github &&
    ageMs >= CI_REFRESH_AFTER_MS &&
    now.getTime() - refreshedAt >= CI_REFRESH_EVERY_MS
  ) {
    const token = await tokenFor(
      deps,
      deps.github,
      repo.installation_id,
      tokens,
    );
    await refreshCommitRuns(deps, deps.github, token, repo, run.sha);
    refreshed = now.toISOString();
    gate = await gateFor(deps.db, repo, run.branch, run.sha, rule, ageMs);
  }

  if (gate.verdict !== 'pass') {
    await settleRun(
      deps.db,
      run,
      {
        status: 'pending',
        reason: gate.reason === 'passed' ? null : gate.reason,
        detail: gate.detail,
        ciSummary: gate,
        ciRefreshedAt: refreshed,
        nextCheckAt: new Date(now.getTime() + RECHECK_MS).toISOString(),
      },
      now,
    );
    return 'waiting';
  }

  if (rule.cooldown_minutes > 0 && rule.last_prepared_at) {
    const until =
      Date.parse(rule.last_prepared_at) + rule.cooldown_minutes * MINUTE_MS;
    if (now.getTime() < until) {
      await settleRun(
        deps.db,
        run,
        {
          status: 'pending',
          reason: 'cooldown',
          detail: `CI passed; waiting for the ${rule.cooldown_minutes}-minute cooldown to end.`,
          ciSummary: gate,
          nextCheckAt: new Date(until).toISOString(),
        },
        now,
      );
      return 'waiting';
    }
  }

  if (!deps.github) {
    return end(
      'failed',
      'github_not_configured',
      'The GitHub App is not configured on this deployment.',
    );
  }

  const token = await tokenFor(deps, deps.github, repo.installation_id, tokens);
  // The branch must still point at the SHA when we act, not just when we were told.
  const head = await deps.github.api.getHeadCommit(
    token,
    repo.full_name,
    run.branch,
  );
  if (!head) {
    return end(
      'failed',
      'repository_unavailable',
      'The branch could not be read on GitHub.',
    );
  }
  if (head.sha !== run.sha) {
    return end(
      'superseded',
      'newer_commit',
      'The branch moved to a newer commit before this one was prepared.',
    );
  }

  const promptId = await prepare(deps, {
    token,
    repo,
    run,
    gate,
    bypassed: false,
    headMessage: head.commit.message,
  });
  await settleRun(
    deps.db,
    run,
    {
      status: 'succeeded',
      reason: 'prepared',
      detail: 'Prompt prepared.',
      ciSummary: gate,
      promptId,
    },
    clock(),
  );
  await markRulePrepared(deps.db, rule.id, run.sha, clock());
  return 'succeeded';
}

/** Context -> deterministic prompt -> stored (idempotently). Returns the prompt id. */
async function prepare(
  deps: EngineDeps,
  input: {
    token: string;
    repo: RepositoryRow;
    run: RunRow;
    gate: GateResult;
    bypassed: boolean;
    headMessage: string | null;
  },
): Promise<string> {
  const { repo, run } = input;
  const github = deps.github as RuntimeGitHub;
  const now = clockOf(deps)();
  const context = await collectContext({
    api: github.api,
    token: input.token,
    repository: {
      id: repo.id,
      fullName: repo.full_name,
      url: repo.html_url,
      description: repo.description,
      defaultBranch: repo.default_branch,
      private: repo.private === 1,
      version: repo.version,
    },
    branch: run.branch,
    sha: run.sha,
    headMessage: input.headMessage,
    pushCommits: run.push_commits,
    ci: { gate: input.gate, bypassed: input.bypassed },
    now,
  });
  const built = buildPrompt(context, { trigger: run.trigger });
  const id = await insertPrompt(
    deps.db,
    {
      userId: run.user_id,
      repositoryId: repo.id,
      repositoryFullName: repo.full_name,
      runId: run.id,
      branch: run.branch,
      sha: run.sha,
      trigger: run.trigger,
      ciBypassed: input.bypassed,
      ciState: context.ci.state,
      summary: built.summary,
      prompt: built.prompt,
      context: JSON.stringify(context),
    },
    now,
  );
  await prunePrompts(deps.db, run.user_id);
  return id;
}

// ---- manual preparation ----------------------------------------------------

export type ManualFailure =
  | 'not_found'
  | 'github_not_configured'
  | 'ci_not_passing'
  | 'already_running'
  | 'access_revoked'
  | 'github_unavailable'
  | 'preparation_failed';

export type ManualResult =
  | { ok: true; promptId: string; runId: string; sha: string }
  | {
      ok: false;
      code: ManualFailure;
      message: string;
      gate?: GateResult;
    };

/**
 * User-initiated preparation for the current head of the default branch.
 * Respects the rule's CI policy (or `all_workflows` without a rule) unless the
 * user explicitly bypasses it — the bypass is recorded on the prompt.
 */
export async function prepareManually(
  deps: EngineDeps,
  input: { userId: string; repositoryId: number; bypassCi: boolean },
): Promise<ManualResult> {
  const clock = clockOf(deps);
  const repo = await getRepository(deps.db, input.repositoryId);
  if (!repo) {
    return { ok: false, code: 'not_found', message: 'Repository not found.' };
  }
  if (!deps.github) {
    return {
      ok: false,
      code: 'github_not_configured',
      message: 'The GitHub App is not configured on this deployment.',
    };
  }
  const github = deps.github;
  const rule = await getRule(deps.db, input.userId, repo.id);

  let run: RunRow | null = null;
  try {
    await recoverStaleRuns(deps.db, clock());
    const token = await github.api.installationToken(repo.installation_id);
    const head = await github.api.getHeadCommit(
      token,
      repo.full_name,
      repo.default_branch,
    );
    if (!head) {
      return {
        ok: false,
        code: 'access_revoked',
        message: 'The default branch could not be read on GitHub.',
      };
    }
    await refreshCommitRuns(deps, github, token, repo, head.sha);
    const gate = await gateFor(
      deps.db,
      repo,
      repo.default_branch,
      head.sha,
      rule,
      Number.POSITIVE_INFINITY,
    );
    if (gate.verdict !== 'pass' && !input.bypassCi) {
      return {
        ok: false,
        code: 'ci_not_passing',
        message: gate.detail,
        gate,
      };
    }
    const bypassed = gate.verdict !== 'pass';

    try {
      run = await createManualRun(
        deps.db,
        {
          userId: input.userId,
          ruleId: rule?.id ?? null,
          repositoryId: repo.id,
          repositoryFullName: repo.full_name,
          branch: repo.default_branch,
          sha: head.sha,
          ciBypassed: bypassed,
        },
        clock(),
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        return {
          ok: false,
          code: 'already_running',
          message: 'A preparation for this repository is already running.',
        };
      }
      throw error;
    }

    const promptId = await prepare(deps, {
      token,
      repo,
      run,
      gate,
      bypassed,
      headMessage: head.commit.message,
    });
    await settleRun(
      deps.db,
      run,
      {
        status: 'succeeded',
        reason: 'prepared',
        detail: bypassed
          ? 'Prepared with the CI check bypassed.'
          : 'Prompt prepared.',
        ciSummary: gate,
        promptId,
      },
      clock(),
    );
    return { ok: true, promptId, runId: run.id, sha: head.sha };
  } catch (error) {
    const failure = classifyFailure(error, clock());
    if (run) {
      await settleRun(
        deps.db,
        run,
        { status: 'failed', reason: failure.reason, detail: failure.detail },
        clock(),
      ).catch(() => undefined);
    }
    return {
      ok: false,
      code:
        failure.reason === 'access_revoked'
          ? 'access_revoked'
          : failure.reason === 'github_not_configured'
            ? 'github_not_configured'
            : failure.reason === 'github_unavailable'
              ? 'github_unavailable'
              : 'preparation_failed',
      message: failure.detail,
    };
  }
}
