import { computeCiState } from '../../../shared/ci-state';
import type { DomainEventSink } from '../../../shared/domain-events';
import type { SyncResultDto } from '../../../shared/dto';
import type { SqlDatabase } from '../../db';
import type { GitHubApi } from '../github/api';
import type { RequestBudget } from '../github/client';
import {
  GitHubApiError,
  GitHubRateLimitError,
  RequestBudgetExhaustedError,
} from '../github/errors';
import {
  mapCommit,
  mapInstallation,
  mapPullRequest,
  mapRelease,
  mapRepository,
  mapWorkflowRun,
  pickVersion,
} from '../github/mapping';
import {
  acquireSyncLease,
  deleteInstallationsNotIn,
  finishSync,
  upsertInstallation,
  listInstallations,
} from '../store/installations';
import { replaceOpenPullRequests } from '../store/pulls';
import { replaceReleases } from '../store/releases';
import {
  applyCi,
  applyHead,
  applyVersion,
  deleteRepository,
  listRepositoryIds,
  listSyncOrder,
  markRepositorySynced,
  recountOpenPullRequests,
  upsertRepository,
  type RepositoryRow,
} from '../store/repositories';
import {
  listDefaultBranchRuns,
  pruneWorkflowRuns,
  upsertWorkflowRun,
} from '../store/runs';
import { pruneHistory } from '../store/retention';

/**
 * Reconciles D1 with GitHub: the initial import, the manual refresh and the
 * cron that catches webhooks DevRadar never received. Webhooks keep state
 * fresh in between; this is the safety net, so it only ever *sets* state to
 * what GitHub says — it publishes no CI/PR domain events (a reconcile is not
 * news, and must not trigger future automation).
 *
 * Bounded by design: a request budget per run (Workers cap subrequests per
 * invocation), a small concurrency, and least-recently-synced-first ordering
 * so a budget that cannot cover everything still rotates through every repo.
 */

/** Worst case for one repository: commit + 3 PR pages + runs + releases + tag. */
const REPOSITORY_COST = 7;
const CONCURRENCY = 3;

export interface SyncDeps {
  db: SqlDatabase;
  api: GitHubApi;
  sink: DomainEventSink;
  /** The same object the GitHub transport spends from. */
  budget: RequestBudget;
  now?: () => Date;
}

export interface SyncOptions {
  /** Restrict to one installation (e.g. right after `installation.created`). */
  installationId?: number;
}

export async function syncAll(
  deps: SyncDeps,
  options: SyncOptions = {},
): Promise<SyncResultDto> {
  const now = deps.now ?? (() => new Date());
  const result: SyncResultDto = {
    installations: 0,
    repositoriesSynced: 0,
    repositoriesRemaining: 0,
    errors: [],
  };

  try {
    const listed = await deps.api.listInstallations();
    for (const gh of listed) {
      const record = mapInstallation(gh);
      if (record)
        await upsertInstallation(deps.db, record, now().toISOString());
    }
    // An installation GitHub no longer lists was uninstalled while we were not
    // listening. Cascade removes its repositories.
    await deleteInstallationsNotIn(
      deps.db,
      listed.map((i) => i.id),
    );
  } catch (error) {
    result.errors.push(describe(error));
    return result;
  }

  const installations = (await listInstallations(deps.db)).filter(
    (row) =>
      !row.suspended_at &&
      (options.installationId === undefined ||
        row.id === options.installationId),
  );

  for (const installation of installations) {
    if (!(await acquireSyncLease(deps.db, installation.id, now()))) {
      result.errors.push(
        `${installation.account_login}: a sync is already running`,
      );
      continue;
    }
    result.installations++;
    const outcome = await syncInstallation(deps, installation.id, now);
    result.repositoriesSynced += outcome.synced;
    result.repositoriesRemaining += outcome.remaining;
    result.errors.push(...outcome.errors);
    await finishSync(deps.db, installation.id, {
      at: now().toISOString(),
      error: outcome.fatal,
    });
    if (outcome.stop) break;
  }

  await pruneHistory(deps.db, now());
  return result;
}

interface InstallationOutcome {
  synced: number;
  remaining: number;
  errors: string[];
  /** Recorded on the installation row. */
  fatal: string | null;
  /** Rate limited: do not start another installation. */
  stop: boolean;
}

async function syncInstallation(
  deps: SyncDeps,
  installationId: number,
  now: () => Date,
): Promise<InstallationOutcome> {
  const outcome: InstallationOutcome = {
    synced: 0,
    remaining: 0,
    errors: [],
    fatal: null,
    stop: false,
  };

  try {
    const token = await deps.api.installationToken(installationId);
    const listed = await deps.api.listInstallationRepositories(token);
    const stamp = now().toISOString();

    for (const gh of listed) {
      await upsertRepository(deps.db, mapRepository(gh, installationId), stamp);
    }

    const present = new Set(listed.map((r) => r.id));
    for (const known of await listRepositoryIds(deps.db, installationId)) {
      if (present.has(known.id)) continue;
      await deleteRepository(deps.db, known.id);
      await deps.sink.publish(
        [
          {
            type: 'repository.removed',
            repositoryId: known.id,
            repositoryFullName: known.full_name,
            installationId,
            occurredAt: stamp,
            actor: null,
            url: null,
            summary: `${known.full_name} is no longer accessible to the GitHub App`,
            data: {},
          },
        ],
        null,
      );
    }

    const queue = await listSyncOrder(deps.db, installationId);
    let next = 0;
    let halted = false;

    const worker = async (): Promise<void> => {
      while (!halted) {
        if (deps.budget.remaining < REPOSITORY_COST) return;
        const repo = queue[next++];
        if (!repo) return;
        try {
          await syncRepository(deps, token, repo, now);
          outcome.synced++;
        } catch (error) {
          if (error instanceof RequestBudgetExhaustedError) {
            halted = true;
            next--; // this repository was not finished
          } else if (error instanceof GitHubRateLimitError) {
            halted = true;
            next--;
            outcome.fatal = error.message;
            outcome.stop = true;
          } else {
            outcome.errors.push(`${repo.full_name}: ${describe(error)}`);
          }
        }
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    outcome.remaining = Math.max(
      0,
      queue.length - outcome.synced - outcome.errors.length,
    );
  } catch (error) {
    outcome.fatal = describe(error);
    outcome.stop = error instanceof GitHubRateLimitError;
    outcome.errors.push(`installation ${installationId}: ${describe(error)}`);
  }

  return outcome;
}

async function syncRepository(
  deps: SyncDeps,
  token: string,
  repo: RepositoryRow,
  now: () => Date,
): Promise<void> {
  const { api, db } = deps;

  // Reads first, writes after: a budget or rate-limit stop mid-repository
  // leaves its stored state exactly as it was.
  const head = await api.getHeadCommit(
    token,
    repo.full_name,
    repo.default_branch,
  );
  const pulls = await api.listOpenPullRequests(token, repo.full_name);
  const runs = await api.listWorkflowRuns(token, repo.full_name);
  const releases = (await api.listReleases(token, repo.full_name))
    .map((release) => mapRelease(release, repo.id))
    .filter((release) => release !== null);
  const tag =
    releases.length === 0 ? await api.latestTag(token, repo.full_name) : null;

  const stamp = now().toISOString();

  if (head) await applyHead(db, repo.id, mapCommit(head), null);

  await replaceOpenPullRequests(
    db,
    repo.id,
    pulls.map((pull) => mapPullRequest(pull, repo.id)),
  );
  await recountOpenPullRequests(db, repo.id);

  if (runs === null) {
    await applyCi(db, repo.id, { state: 'unknown', sha: null }, stamp);
  } else {
    for (const run of runs)
      await upsertWorkflowRun(db, mapWorkflowRun(run, repo.id));
    await pruneWorkflowRuns(db, repo.id);
    const ci = computeCiState(
      await listDefaultBranchRuns(db, repo.id, repo.default_branch),
    );
    await applyCi(db, repo.id, ci, stamp);
  }

  await replaceReleases(db, repo.id, releases);
  await applyVersion(db, repo.id, pickVersion(releases, tag));
  await markRepositorySynced(db, repo.id, stamp);
}

/** A message safe to store and show: never a token, never a raw body. */
export function describe(error: unknown): string {
  if (error instanceof GitHubApiError) return error.message;
  if (error instanceof RequestBudgetExhaustedError) return error.message;
  if (error instanceof Error && error.name === 'GitHubConfigError') {
    return error.message;
  }
  return 'Unexpected error while syncing';
}
