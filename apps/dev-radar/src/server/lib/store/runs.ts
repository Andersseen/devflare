import type { Rows, SqlDatabase } from '../../db';
import type { RunSummary } from '../../../shared/ci-state';
import type { WorkflowRunRecord } from './types';

export const RUNS_KEPT_PER_REPOSITORY = 50;

export interface WorkflowRunRow {
  id: number;
  repository_id: number;
  workflow_id: number;
  name: string;
  event: string;
  branch: string | null;
  head_sha: string;
  status: string;
  conclusion: string | null;
  run_number: number;
  run_attempt: number;
  html_url: string;
  created_at: string;
  updated_at: string;
}

export async function upsertWorkflowRun(
  db: SqlDatabase,
  r: WorkflowRunRecord,
): Promise<void> {
  await db.sql`INSERT INTO workflow_runs
      (id, repository_id, workflow_id, name, event, branch, head_sha, status, conclusion,
       run_number, run_attempt, html_url, created_at, updated_at)
    VALUES (${r.id}, ${r.repositoryId}, ${r.workflowId}, ${r.name}, ${r.event}, ${r.branch},
      ${r.headSha}, ${r.status}, ${r.conclusion}, ${r.runNumber}, ${r.runAttempt},
      ${r.htmlUrl}, ${r.createdAt}, ${r.updatedAt})
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, status = excluded.status,
      conclusion = excluded.conclusion, run_attempt = excluded.run_attempt,
      html_url = excluded.html_url, updated_at = excluded.updated_at
    WHERE excluded.updated_at >= workflow_runs.updated_at`;
}

export async function pruneWorkflowRuns(
  db: SqlDatabase,
  repositoryId: number,
): Promise<void> {
  await db.sql`DELETE FROM workflow_runs WHERE repository_id = ${repositoryId} AND id NOT IN (
    SELECT id FROM workflow_runs WHERE repository_id = ${repositoryId}
    ORDER BY created_at DESC, id DESC LIMIT ${RUNS_KEPT_PER_REPOSITORY})`;
}

const toSummary = (row: WorkflowRunRow): RunSummary => ({
  workflowId: row.workflow_id,
  headSha: row.head_sha,
  status: row.status,
  conclusion: row.conclusion,
  runAttempt: row.run_attempt,
  createdAt: row.created_at,
});

/**
 * Runs that describe the *default branch itself*. Pull-request events are
 * excluded: a fork's PR from its own `main` also reports `head_branch: main`.
 */
export async function listDefaultBranchRuns(
  db: SqlDatabase,
  repositoryId: number,
  defaultBranch: string,
): Promise<RunSummary[]> {
  const result = await db.sql<Rows<WorkflowRunRow>>`SELECT * FROM workflow_runs
    WHERE repository_id = ${repositoryId} AND branch = ${defaultBranch}
      AND event NOT LIKE 'pull_request%'`;
  return (result.rows ?? []).map(toSummary);
}

/** All stored runs of the repository for the given commits (PR head shas). */
export async function listRunSummariesForShas(
  db: SqlDatabase,
  repositoryIds: number[],
): Promise<Map<string, RunSummary[]>> {
  const ids = JSON.stringify(repositoryIds);
  const result = await db.sql<Rows<WorkflowRunRow>>`SELECT * FROM workflow_runs
    WHERE repository_id IN (SELECT value FROM json_each(${ids}))`;
  const byKey = new Map<string, RunSummary[]>();
  for (const row of result.rows ?? []) {
    const key = `${row.repository_id}:${row.head_sha}`;
    byKey.set(key, [...(byKey.get(key) ?? []), toSummary(row)]);
  }
  return byKey;
}

export async function listWorkflowRunRows(
  db: SqlDatabase,
  repositoryId: number,
  limit = 20,
): Promise<WorkflowRunRow[]> {
  const result = await db.sql<
    Rows<WorkflowRunRow>
  >`SELECT * FROM workflow_runs WHERE repository_id = ${repositoryId}
    ORDER BY created_at DESC, id DESC LIMIT ${limit}`;
  return result.rows ?? [];
}
