import type {
  CiPolicy,
  GateRun,
  RunReason,
  RunStatus,
  RunTrigger,
} from '../../../shared/automation';
import { AUTOMATION_TYPE, LIMITS } from '../../../shared/automation';
import type { Rows, SqlDatabase } from '../../db';

/**
 * Automation rules and runs (spec 023). Every query that takes a user id
 * scopes by it in the SQL itself. The processor-side functions (`claimDue`,
 * `recoverStale`, …) are the only ones that work across users.
 */

export interface RuleRow {
  id: string;
  user_id: string;
  repository_id: number;
  type: string;
  enabled: number;
  branch: string | null;
  ci_policy: CiPolicy;
  required_workflow_ids: string;
  settle_seconds: number;
  cooldown_minutes: number;
  chatgpt_url: string | null;
  last_triggered_sha: string | null;
  last_triggered_at: string | null;
  last_prepared_sha: string | null;
  last_prepared_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RunRow {
  id: string;
  rule_id: string | null;
  user_id: string;
  repository_id: number;
  repository_full_name: string;
  branch: string;
  sha: string;
  trigger: RunTrigger;
  ci_bypassed: number;
  status: RunStatus;
  reason: RunReason | null;
  detail: string | null;
  attempts: number;
  not_before: string;
  next_check_at: string;
  expires_at: string;
  lease_until: string | null;
  lease_token: string | null;
  ci_refreshed_at: string | null;
  ci_summary: string | null;
  push_commits: number | null;
  prompt_id: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

export const LEASE_SECONDS = 150;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
export const RUN_RETENTION_DAYS = 30;

const iso = (date: Date): string => date.toISOString();
const plus = (date: Date, ms: number): string =>
  new Date(date.getTime() + ms).toISOString();

export function requiredWorkflowIds(rule: RuleRow): number[] {
  try {
    const parsed: unknown = JSON.parse(rule.required_workflow_ids);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is number => Number.isSafeInteger(v))
      : [];
  } catch {
    return [];
  }
}

// ---- rules -----------------------------------------------------------------

export interface RuleInput {
  enabled: boolean;
  ciPolicy: CiPolicy;
  requiredWorkflowIds: number[];
  settleSeconds: number;
  cooldownMinutes: number;
  chatgptUrl: string | null;
}

export async function getRule(
  db: SqlDatabase,
  userId: string,
  repositoryId: number,
): Promise<RuleRow | null> {
  const result = await db.sql<Rows<RuleRow>>`SELECT * FROM automation_rule
    WHERE user_id = ${userId} AND repository_id = ${repositoryId}
      AND type = ${AUTOMATION_TYPE}`;
  return result.rows?.[0] ?? null;
}

export async function listRules(
  db: SqlDatabase,
  userId: string,
): Promise<RuleRow[]> {
  const result = await db.sql<Rows<RuleRow>>`SELECT * FROM automation_rule
    WHERE user_id = ${userId} ORDER BY updated_at DESC, id`;
  return result.rows ?? [];
}

export async function upsertRule(
  db: SqlDatabase,
  userId: string,
  repositoryId: number,
  input: RuleInput,
  now: Date = new Date(),
): Promise<RuleRow> {
  const stamp = iso(now);
  const workflows = JSON.stringify(input.requiredWorkflowIds);
  await db.sql`INSERT INTO automation_rule
      (id, user_id, repository_id, type, enabled, branch, ci_policy, required_workflow_ids,
       settle_seconds, cooldown_minutes, chatgpt_url, created_at, updated_at)
    VALUES (${crypto.randomUUID()}, ${userId}, ${repositoryId}, ${AUTOMATION_TYPE},
      ${input.enabled ? 1 : 0}, NULL, ${input.ciPolicy}, ${workflows},
      ${input.settleSeconds}, ${input.cooldownMinutes}, ${input.chatgptUrl}, ${stamp}, ${stamp})
    ON CONFLICT (user_id, repository_id, type) DO UPDATE SET
      enabled = excluded.enabled, ci_policy = excluded.ci_policy,
      required_workflow_ids = excluded.required_workflow_ids,
      settle_seconds = excluded.settle_seconds, cooldown_minutes = excluded.cooldown_minutes,
      chatgpt_url = excluded.chatgpt_url, updated_at = excluded.updated_at`;
  const rule = await getRule(db, userId, repositoryId);
  if (!rule) throw new Error('rule vanished after upsert');
  return rule;
}

/** Enabled rules on a repository whose owner still follows it. */
export async function listRulesToTrigger(
  db: SqlDatabase,
  repositoryId: number,
): Promise<RuleRow[]> {
  const result = await db.sql<Rows<RuleRow>>`SELECT r.* FROM automation_rule r
    JOIN followed_repository f
      ON f.user_id = r.user_id AND f.repository_id = r.repository_id
    WHERE r.repository_id = ${repositoryId} AND r.enabled = 1
      AND r.type = ${AUTOMATION_TYPE}`;
  return result.rows ?? [];
}

export async function markRuleTriggered(
  db: SqlDatabase,
  ruleId: string,
  sha: string,
  now: Date,
): Promise<void> {
  await db.sql`UPDATE automation_rule SET last_triggered_sha = ${sha},
      last_triggered_at = ${iso(now)} WHERE id = ${ruleId}`;
}

export async function markRulePrepared(
  db: SqlDatabase,
  ruleId: string,
  sha: string,
  now: Date,
): Promise<void> {
  await db.sql`UPDATE automation_rule SET last_prepared_sha = ${sha},
      last_prepared_at = ${iso(now)} WHERE id = ${ruleId}`;
}

// ---- runs: creation --------------------------------------------------------

export interface NewAutomaticRun {
  rule: RuleRow;
  repositoryFullName: string;
  branch: string;
  sha: string;
  pushCommits: number | null;
}

/**
 * Records the trigger. Idempotent: the unique (rule, sha) index swallows a
 * redelivery or replay. Older pending runs of the rule are superseded *after*
 * the insert, so a crash in between never leaves the rule without a candidate.
 */
export async function createAutomaticRun(
  db: SqlDatabase,
  run: NewAutomaticRun,
  now: Date = new Date(),
): Promise<void> {
  const stamp = iso(now);
  const notBefore = plus(now, run.rule.settle_seconds * 1000);
  await db.sql`INSERT OR IGNORE INTO automation_run
      (id, rule_id, user_id, repository_id, repository_full_name, branch, sha, trigger,
       status, attempts, not_before, next_check_at, expires_at, push_commits, reason,
       created_at, updated_at)
    VALUES (${crypto.randomUUID()}, ${run.rule.id}, ${run.rule.user_id}, ${run.rule.repository_id},
      ${run.repositoryFullName}, ${run.branch}, ${run.sha}, 'automatic', 'pending', 0,
      ${notBefore}, ${notBefore}, ${plus(now, LIMITS.runExpiryHours * HOUR_MS)},
      ${run.pushCommits}, 'settling', ${stamp}, ${stamp})`;
  await db.sql`UPDATE automation_run SET status = 'superseded', reason = 'newer_commit',
      detail = 'A newer commit reached the branch before this one was prepared.',
      lease_until = NULL, lease_token = NULL, updated_at = ${stamp}, finished_at = ${stamp}
    WHERE rule_id = ${run.rule.id} AND trigger = 'automatic' AND status = 'pending'
      AND sha != ${run.sha}`;
  await markRuleTriggered(db, run.rule.id, run.sha, now);
}

export interface NewManualRun {
  userId: string;
  ruleId: string | null;
  repositoryId: number;
  repositoryFullName: string;
  branch: string;
  sha: string;
  ciBypassed: boolean;
}

/** Throws on the unique in-flight index when one is already running. */
export async function createManualRun(
  db: SqlDatabase,
  run: NewManualRun,
  now: Date = new Date(),
): Promise<RunRow> {
  const stamp = iso(now);
  const id = crypto.randomUUID();
  const token = crypto.randomUUID();
  await db.sql`INSERT INTO automation_run
      (id, rule_id, user_id, repository_id, repository_full_name, branch, sha, trigger,
       ci_bypassed, status, attempts, not_before, next_check_at, expires_at,
       lease_until, lease_token, created_at, updated_at)
    VALUES (${id}, ${run.ruleId}, ${run.userId}, ${run.repositoryId}, ${run.repositoryFullName},
      ${run.branch}, ${run.sha}, 'manual', ${run.ciBypassed ? 1 : 0}, 'running', 0,
      ${stamp}, ${stamp}, ${plus(now, LIMITS.runExpiryHours * HOUR_MS)},
      ${plus(now, LEASE_SECONDS * 1000)}, ${token}, ${stamp}, ${stamp})`;
  const created = await getRunById(db, id);
  if (!created) throw new Error('run vanished after insert');
  return created;
}

export function isUniqueViolation(error: unknown): boolean {
  // Not `instanceof Error`: drivers throw errors from other realms.
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error);
  return /UNIQUE constraint|constraint failed/i.test(message);
}

// ---- runs: processor -------------------------------------------------------

/** Makes a repository's waiting runs for `sha` due now (a workflow_run arrived). */
export async function wakeRuns(
  db: SqlDatabase,
  repositoryId: number,
  sha: string,
  now: Date = new Date(),
): Promise<void> {
  await db.sql`UPDATE automation_run SET next_check_at = ${iso(now)}
    WHERE repository_id = ${repositoryId} AND sha = ${sha}
      AND status = 'pending' AND trigger = 'automatic' AND next_check_at > ${iso(now)}`;
}

/** Runs whose lease ran out are retried (automatic) or failed (manual). */
export async function recoverStaleRuns(
  db: SqlDatabase,
  now: Date = new Date(),
): Promise<void> {
  const stamp = iso(now);
  await db.sql`UPDATE automation_run SET
      status = CASE WHEN trigger = 'manual' OR attempts + 1 >= ${LIMITS.maxAttempts}
        THEN 'failed' ELSE 'pending' END,
      reason = CASE WHEN trigger = 'manual' OR attempts + 1 >= ${LIMITS.maxAttempts}
        THEN 'interrupted' ELSE reason END,
      detail = CASE WHEN trigger = 'manual' OR attempts + 1 >= ${LIMITS.maxAttempts}
        THEN 'The preparation was interrupted before it finished.' ELSE detail END,
      finished_at = CASE WHEN trigger = 'manual' OR attempts + 1 >= ${LIMITS.maxAttempts}
        THEN ${stamp} ELSE NULL END,
      attempts = attempts + 1, next_check_at = ${stamp},
      lease_until = NULL, lease_token = NULL, updated_at = ${stamp}
    WHERE status = 'running' AND lease_until < ${stamp}`;
}

export async function expireRuns(
  db: SqlDatabase,
  now: Date = new Date(),
): Promise<void> {
  const stamp = iso(now);
  await db.sql`UPDATE automation_run SET status = 'expired',
      reason = CASE WHEN reason IN ('workflow_failed', 'workflow_missing', 'no_ci')
        THEN reason ELSE 'expired' END,
      lease_until = NULL, lease_token = NULL, updated_at = ${stamp}, finished_at = ${stamp}
    WHERE status = 'pending' AND expires_at < ${stamp}`;
}

/**
 * Claims up to `limit` due runs. D1 reports no change count, so each claim is
 * an UPDATE guarded on `status = 'pending'` followed by a read-back of the
 * random lease token: only the caller whose token is stored owns the run.
 */
export async function claimDueRuns(
  db: SqlDatabase,
  limit: number,
  now: Date = new Date(),
): Promise<RunRow[]> {
  const stamp = iso(now);
  const candidates = await db.sql<
    Rows<{ id: string }>
  >`SELECT id FROM automation_run
    WHERE status = 'pending' AND next_check_at <= ${stamp} AND not_before <= ${stamp}
    ORDER BY next_check_at, id LIMIT ${limit}`;

  const claimed: RunRow[] = [];
  for (const { id } of candidates.rows ?? []) {
    const token = crypto.randomUUID();
    await db.sql`UPDATE automation_run SET status = 'running', lease_token = ${token},
        lease_until = ${plus(now, LEASE_SECONDS * 1000)}, updated_at = ${stamp}
      WHERE id = ${id} AND status = 'pending' AND next_check_at <= ${stamp}`;
    const mine = await db.sql<Rows<RunRow>>`SELECT * FROM automation_run
      WHERE id = ${id} AND lease_token = ${token} AND status = 'running'`;
    if (mine.rows?.[0]) claimed.push(mine.rows[0]);
  }
  return claimed;
}

export interface RunPatch {
  status: RunStatus;
  reason?: RunReason | null;
  detail?: string | null;
  attempts?: number;
  nextCheckAt?: string;
  ciSummary?: unknown;
  ciRefreshedAt?: string;
  promptId?: string | null;
}

/**
 * Writes the outcome of one processing step. Guarded by the lease token, so a
 * processor that lost its lease cannot overwrite the new owner's result.
 * Returns whether the write was applied.
 */
export async function settleRun(
  db: SqlDatabase,
  run: RunRow,
  patch: RunPatch,
  now: Date = new Date(),
): Promise<boolean> {
  const stamp = iso(now);
  const terminal = patch.status !== 'pending' && patch.status !== 'running';
  const summary =
    patch.ciSummary === undefined ? null : JSON.stringify(patch.ciSummary);
  await db.sql`UPDATE automation_run SET status = ${patch.status},
      reason = ${patch.reason === undefined ? run.reason : patch.reason},
      detail = ${patch.detail === undefined ? run.detail : patch.detail},
      attempts = ${patch.attempts ?? run.attempts},
      next_check_at = ${patch.nextCheckAt ?? run.next_check_at},
      ci_summary = COALESCE(${summary}, ci_summary),
      ci_refreshed_at = COALESCE(${patch.ciRefreshedAt ?? null}, ci_refreshed_at),
      prompt_id = COALESCE(${patch.promptId ?? null}, prompt_id),
      lease_until = NULL, lease_token = NULL, updated_at = ${stamp},
      finished_at = ${terminal ? stamp : null}
    WHERE id = ${run.id} AND lease_token = ${run.lease_token}`;
  const check = await db.sql<
    Rows<{ lease_token: string | null }>
  >`SELECT lease_token
    FROM automation_run WHERE id = ${run.id}`;
  return check.rows?.[0]?.lease_token === null;
}

// ---- runs: reads -----------------------------------------------------------

export async function getRunById(
  db: SqlDatabase,
  id: string,
): Promise<RunRow | null> {
  const result = await db.sql<
    Rows<RunRow>
  >`SELECT * FROM automation_run WHERE id = ${id}`;
  return result.rows?.[0] ?? null;
}

export async function listRuns(
  db: SqlDatabase,
  userId: string,
  repositoryId: number,
  limit = 20,
): Promise<RunRow[]> {
  const result = await db.sql<Rows<RunRow>>`SELECT * FROM automation_run
    WHERE user_id = ${userId} AND repository_id = ${repositoryId}
    ORDER BY created_at DESC, id DESC LIMIT ${limit}`;
  return result.rows ?? [];
}

/** The newest automatic run of each of the user's rules, keyed by rule id. */
export async function latestAutomaticRuns(
  db: SqlDatabase,
  userId: string,
): Promise<Map<string, RunRow>> {
  const result = await db.sql<
    Rows<RunRow>
  >`SELECT * FROM automation_run WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY rule_id ORDER BY created_at DESC, id DESC) AS position
        FROM automation_run WHERE user_id = ${userId} AND trigger = 'automatic'
      ) WHERE position = 1)`;
  return new Map(
    (result.rows ?? []).flatMap((row) =>
      row.rule_id ? [[row.rule_id, row]] : [],
    ),
  );
}

/** Runs of one commit on the target branch that the CI gate may count. */
export async function listGateRuns(
  db: SqlDatabase,
  repositoryId: number,
  branch: string,
  sha: string,
): Promise<GateRun[]> {
  const result = await db.sql<
    Rows<{
      workflow_id: number;
      name: string;
      head_sha: string;
      status: string;
      conclusion: string | null;
      run_attempt: number;
      created_at: string;
      html_url: string;
    }>
  >`SELECT workflow_id, name, head_sha, status, conclusion, run_attempt, created_at, html_url
    FROM workflow_runs
    WHERE repository_id = ${repositoryId} AND head_sha = ${sha} AND branch = ${branch}
      AND event NOT LIKE 'pull_request%'`;
  return (result.rows ?? []).map((row) => ({
    workflowId: row.workflow_id,
    name: row.name,
    headSha: row.head_sha,
    status: row.status,
    conclusion: row.conclusion,
    runAttempt: row.run_attempt,
    createdAt: row.created_at,
    htmlUrl: row.html_url,
  }));
}

/** Workflows DevRadar has seen on a repository (id + newest known name). */
export async function listKnownWorkflows(
  db: SqlDatabase,
  repositoryId: number,
): Promise<{ id: number; name: string }[]> {
  const result = await db.sql<
    Rows<{ workflow_id: number; name: string }>
  >`SELECT workflow_id, name FROM (
      SELECT workflow_id, name,
        ROW_NUMBER() OVER (PARTITION BY workflow_id ORDER BY created_at DESC, id DESC) AS position
      FROM workflow_runs WHERE repository_id = ${repositoryId}
    ) WHERE position = 1 ORDER BY name COLLATE NOCASE`;
  return (result.rows ?? []).map((row) => ({
    id: row.workflow_id,
    name: row.name,
  }));
}

/** Retention: finished runs after 30 days. Waiting/running ones are never touched. */
export async function pruneAutomationRuns(
  db: SqlDatabase,
  now: Date = new Date(),
): Promise<void> {
  const cutoff = plus(now, -RUN_RETENTION_DAYS * DAY_MS);
  await db.sql`DELETE FROM automation_run
    WHERE status NOT IN ('pending', 'running') AND finished_at IS NOT NULL
      AND finished_at < ${cutoff}`;
}

export async function getRuleById(
  db: SqlDatabase,
  id: string,
): Promise<RuleRow | null> {
  const result = await db.sql<
    Rows<RuleRow>
  >`SELECT * FROM automation_rule WHERE id = ${id}`;
  return result.rows?.[0] ?? null;
}

export async function isFollowing(
  db: SqlDatabase,
  userId: string,
  repositoryId: number,
): Promise<boolean> {
  const result = await db.sql<Rows<{ total: number }>>`SELECT COUNT(*) AS total
    FROM followed_repository WHERE user_id = ${userId} AND repository_id = ${repositoryId}`;
  return (result.rows?.[0]?.total ?? 0) > 0;
}

export async function listFollowedIds(
  db: SqlDatabase,
  userId: string,
): Promise<Set<number>> {
  const result = await db.sql<
    Rows<{ repository_id: number }>
  >`SELECT repository_id
    FROM followed_repository WHERE user_id = ${userId}`;
  return new Set((result.rows ?? []).map((row) => row.repository_id));
}

/** Followed, non-archived repositories — the ones an automation can be set up on. */
export async function listEligibleRepositories(
  db: SqlDatabase,
  userId: string,
): Promise<
  { id: number; full_name: string; default_branch: string; ci_state: string }[]
> {
  const result = await db.sql<
    Rows<{
      id: number;
      full_name: string;
      default_branch: string;
      ci_state: string;
    }>
  >`SELECT r.id, r.full_name, r.default_branch, r.ci_state
    FROM repositories r JOIN followed_repository f ON f.repository_id = r.id
    WHERE f.user_id = ${userId} AND r.archived = 0
    ORDER BY r.full_name COLLATE NOCASE`;
  return result.rows ?? [];
}
