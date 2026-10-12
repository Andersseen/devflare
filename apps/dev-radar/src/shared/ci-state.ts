/**
 * CI state of a repository's default branch, derived from GitHub Actions runs.
 *
 *   unknown  — nothing is known (never synced, or runs could not be read, or
 *              every run was cancelled/skipped so none of them says anything)
 *   none     — synced, and the default branch has no workflow runs. This is NOT
 *              "passing": a repository without CI must never look green.
 *   pending  — at least one workflow of the evaluated commit has not finished
 *   success  — every counted workflow of that commit finished successfully
 *   failure  — at least one counted workflow of that commit failed
 *
 * Pure and framework-free: the server uses it to persist the state, the
 * dashboard uses the same type to render it.
 */

export type CiState = 'unknown' | 'none' | 'pending' | 'success' | 'failure';

export interface RunSummary {
  workflowId: number;
  headSha: string;
  status: string;
  conclusion: string | null;
  runAttempt: number;
  /** ISO timestamp the run was created. */
  createdAt: string;
}

export interface CiResult {
  state: CiState;
  /** The commit the state describes; null for `unknown` / `none`. */
  sha: string | null;
}

/** Conclusions that mean "this workflow failed". */
const FAILED = new Set(['failure', 'timed_out', 'startup_failure']);
/** Conclusions that carry no signal about the commit's health. */
const IGNORED = new Set(['cancelled', 'skipped', 'stale']);
/** Conclusions that need a human before the run can finish. */
const NEEDS_ACTION = new Set(['action_required']);

function runRank(run: RunSummary): [number, number] {
  return [run.runAttempt, Date.parse(run.createdAt)];
}

/** The newest attempt of each workflow, keyed by workflow id. */
function latestPerWorkflow(runs: RunSummary[]): RunSummary[] {
  const latest = new Map<number, RunSummary>();
  for (const run of runs) {
    const current = latest.get(run.workflowId);
    if (!current) {
      latest.set(run.workflowId, run);
      continue;
    }
    const [attemptA, timeA] = runRank(run);
    const [attemptB, timeB] = runRank(current);
    if (timeA > timeB || (timeA === timeB && attemptA > attemptB)) {
      latest.set(run.workflowId, run);
    }
  }
  return [...latest.values()];
}

/**
 * @param runs workflow runs on the repository's default branch, any order.
 *
 * The evaluated commit is the most recent one that ran any workflow. Within it
 * only the latest run of each workflow counts, so a re-run that passes
 * supersedes the failure it retried.
 */
export function computeCiState(runs: readonly RunSummary[]): CiResult {
  if (runs.length === 0) return { state: 'none', sha: null };

  const newest = runs.reduce((a, b) =>
    Date.parse(b.createdAt) > Date.parse(a.createdAt) ? b : a,
  );
  const ofCommit = runs.filter((run) => run.headSha === newest.headSha);
  const counted = latestPerWorkflow(ofCommit).filter(
    (run) => !(run.conclusion && IGNORED.has(run.conclusion)),
  );

  if (counted.length === 0) return { state: 'unknown', sha: newest.headSha };

  const sha = newest.headSha;
  if (counted.some((run) => run.conclusion && FAILED.has(run.conclusion))) {
    return { state: 'failure', sha };
  }
  const unfinished = counted.some(
    (run) =>
      run.status !== 'completed' ||
      (run.conclusion !== null && NEEDS_ACTION.has(run.conclusion)),
  );
  if (unfinished) return { state: 'pending', sha };
  return { state: 'success', sha };
}

export const CI_STATE_LABEL: Record<CiState, string> = {
  unknown: 'Unknown',
  none: 'No CI',
  pending: 'Running',
  success: 'Passing',
  failure: 'Failing',
};

/** Repositories whose CI is failing or still running need a look. */
export function ciNeedsAttention(state: CiState): boolean {
  return state === 'failure' || state === 'pending';
}
