import { computeCiState } from '../../../shared/ci-state';
import type {
  DomainEvent,
  DomainEventSink,
} from '../../../shared/domain-events';
import type { SqlDatabase } from '../../db';
import {
  firstLine,
  mapInstallation,
  mapPullRequest,
  mapRelease,
  mapWorkflowRun,
  pickVersion,
} from '../github/mapping';
import { claimDelivery, finishDelivery, type Claim } from '../store/deliveries';
import {
  deleteInstallation,
  hasInstallation,
  setInstallationSuspended,
  upsertInstallation,
} from '../store/installations';
import { wakeRuns } from '../store/automation';
import { deletePullRequest, upsertPullRequest } from '../store/pulls';
import {
  deleteRelease,
  listReleasesFor,
  pruneReleases,
  upsertRelease,
} from '../store/releases';
import {
  applyCi,
  applyHead,
  applyVersion,
  deleteRepository,
  getRepository,
  recountOpenPullRequests,
  updateIdentity,
  type RepositoryRow,
} from '../store/repositories';
import { pruneHistory } from '../store/retention';
import {
  listDefaultBranchRuns,
  pruneWorkflowRuns,
  upsertWorkflowRun,
} from '../store/runs';
import {
  isDefaultBranchPush,
  normalizeInstallation,
  normalizeInstallationRepositories,
  normalizePullRequest,
  normalizePush,
  normalizeRelease,
} from './normalize';
import {
  isInstallation,
  isPullRequest,
  isPush,
  isRecord,
  isRelease,
  isWorkflowRun,
  type InstallationPayload,
  type InstallationRepositoriesPayload,
  type PullRequestEvent,
  type PushEvent,
  type ReleaseEvent,
  type WebhookRepository,
  type WorkflowRunEvent,
} from './payloads';

/**
 * Applies one verified webhook delivery: claim it (idempotency), update the
 * mirrored state from the payload, publish normalized domain events.
 *
 * The response to GitHub must be fast, so only cheap, payload-local work runs
 * inline. Anything that needs GitHub API calls (a new installation's initial
 * import, newly added repositories) is handed to `scheduleSync`, which runs
 * after the response (waitUntil).
 */

export interface WebhookDeps {
  db: SqlDatabase;
  sink: DomainEventSink;
  now?: () => Date;
  /** Fire-and-forget: sync this installation after the response is sent. */
  scheduleSync: (installationId: number) => void;
  /** Overridable for tests; production prunes on ~5% of deliveries. */
  shouldPrune?: () => boolean;
}

export interface WebhookInput {
  deliveryId: string;
  event: string;
  payload: unknown;
}

export type WebhookResult =
  | { result: 'processed' | 'ignored'; reason?: string }
  | { result: 'duplicate' | 'in_progress' | 'abandoned' };

type Handled =
  | { result: 'processed'; repositoryId?: number; installationId?: number }
  | { result: 'ignored'; reason: string; installationId?: number };

export class WebhookProcessingError extends Error {
  constructor() {
    super('Webhook processing failed');
    this.name = 'WebhookProcessingError';
  }
}

export const SUPPORTED_EVENTS = [
  'installation',
  'installation_repositories',
  'push',
  'pull_request',
  'workflow_run',
  'release',
] as const;

function metaOf(input: WebhookInput) {
  const payload = isRecord(input.payload) ? input.payload : {};
  const installation = isRecord(payload['installation'])
    ? payload['installation']
    : {};
  const repository = isRecord(payload['repository'])
    ? payload['repository']
    : {};
  return {
    event: input.event,
    action: typeof payload['action'] === 'string' ? payload['action'] : null,
    installationId:
      typeof installation['id'] === 'number' ? installation['id'] : null,
    repositoryId:
      typeof repository['id'] === 'number' ? repository['id'] : null,
  };
}

export async function processWebhook(
  deps: WebhookDeps,
  input: WebhookInput,
): Promise<WebhookResult> {
  const now = deps.now ?? (() => new Date());
  const claim: Claim = await claimDelivery(
    deps.db,
    input.deliveryId,
    metaOf(input),
    now(),
  );
  if (claim.kind !== 'process') return { result: claim.kind };

  try {
    const handled = await dispatch(deps, input, now);
    await finishDelivery(
      deps.db,
      input.deliveryId,
      {
        status: handled.result,
        repositoryId: 'repositoryId' in handled ? handled.repositoryId : null,
        installationId: handled.installationId,
      },
      now(),
    );
    if ((deps.shouldPrune ?? (() => Math.random() < 0.05))()) {
      await pruneHistory(deps.db, now());
    }
    return handled.result === 'ignored'
      ? { result: 'ignored', reason: handled.reason }
      : { result: 'processed' };
  } catch {
    // The error text could carry payload fragments; the log line and the
    // stored value are fixed strings. GitHub sees a 5xx and can redeliver.
    await finishDelivery(
      deps.db,
      input.deliveryId,
      { status: 'failed', error: 'processing failed' },
      now(),
    ).catch(() => undefined);
    throw new WebhookProcessingError();
  }
}

async function dispatch(
  deps: WebhookDeps,
  input: WebhookInput,
  now: () => Date,
): Promise<Handled> {
  const { payload } = input;
  switch (input.event) {
    case 'push':
      return isPush(payload)
        ? handlePush(deps, input, payload, now)
        : ignored('malformed_payload');
    case 'pull_request':
      return isPullRequest(payload)
        ? handlePullRequest(deps, input, payload, now)
        : ignored('malformed_payload');
    case 'workflow_run':
      return isWorkflowRun(payload)
        ? handleWorkflowRun(deps, input, payload, now)
        : ignored('malformed_payload');
    case 'release':
      return isRelease(payload)
        ? handleRelease(deps, input, payload, now)
        : ignored('malformed_payload');
    case 'installation':
      return isInstallation(payload)
        ? handleInstallation(deps, input, payload, now)
        : ignored('malformed_payload');
    case 'installation_repositories':
      return isInstallation(payload)
        ? handleInstallationRepositories(
            deps,
            input,
            payload as InstallationRepositoriesPayload,
            now,
          )
        : ignored('malformed_payload');
    default:
      // `ping` and every event DevRadar did not subscribe to.
      return ignored(input.event === 'ping' ? 'ping' : 'unsupported_event');
  }
}

const ignored = (reason: string, installationId?: number): Handled => ({
  result: 'ignored',
  reason,
  installationId,
});

/**
 * The stored repository for a payload, with its names refreshed. A repository
 * DevRadar has not synced yet is not guessed at: the installation gets a sync
 * and this delivery is ignored.
 */
async function knownRepository(
  deps: WebhookDeps,
  repository: WebhookRepository,
  installationId: number | undefined,
  now: () => Date,
): Promise<RepositoryRow | null> {
  const row = await getRepository(deps.db, repository.id);
  if (!row) {
    if (
      installationId !== undefined &&
      (await hasInstallation(deps.db, installationId))
    ) {
      deps.scheduleSync(installationId);
    }
    return null;
  }
  await updateIdentity(
    deps.db,
    row.id,
    {
      ownerLogin:
        repository.owner?.login ?? repository.owner?.name ?? row.owner_login,
      name: repository.name,
      fullName: repository.full_name,
      htmlUrl: repository.html_url ?? row.html_url,
      defaultBranch: repository.default_branch ?? row.default_branch,
      private: repository.private ?? row.private === 1,
      archived: repository.archived ?? row.archived === 1,
    },
    now().toISOString(),
  );
  return {
    ...row,
    full_name: repository.full_name,
    default_branch: repository.default_branch ?? row.default_branch,
  };
}

async function handlePush(
  deps: WebhookDeps,
  input: WebhookInput,
  payload: PushEvent,
  now: () => Date,
): Promise<Handled> {
  const row = await knownRepository(
    deps,
    payload.repository,
    payload.installation?.id,
    now,
  );
  if (!row) return ignored('unknown_repository', payload.installation?.id);
  if (!isDefaultBranchPush(payload))
    return ignored('not_default_branch', payload.installation?.id);

  const head = payload.head_commit;
  await applyHead(
    deps.db,
    row.id,
    {
      sha: payload.after,
      message: firstLine(head?.message),
      author:
        head?.author?.username ??
        head?.author?.name ??
        payload.pusher?.name ??
        null,
      committedAt: head?.timestamp ?? null,
    },
    head?.timestamp ?? null,
  );

  await deps.sink.publish(
    normalizePush(payload, now().toISOString()),
    input.deliveryId,
  );
  return {
    result: 'processed',
    repositoryId: row.id,
    installationId: payload.installation?.id,
  };
}

async function handlePullRequest(
  deps: WebhookDeps,
  input: WebhookInput,
  payload: PullRequestEvent,
  now: () => Date,
): Promise<Handled> {
  const row = await knownRepository(
    deps,
    payload.repository,
    payload.installation?.id,
    now,
  );
  if (!row) return ignored('unknown_repository', payload.installation?.id);

  const pr = payload.pull_request;
  if (pr.state === 'open') {
    await upsertPullRequest(deps.db, mapPullRequest(pr, row.id));
  } else {
    await deletePullRequest(deps.db, pr.id);
  }
  await recountOpenPullRequests(deps.db, row.id);

  await deps.sink.publish(
    normalizePullRequest(payload, now().toISOString()),
    input.deliveryId,
  );
  return {
    result: 'processed',
    repositoryId: row.id,
    installationId: payload.installation?.id,
  };
}

async function handleWorkflowRun(
  deps: WebhookDeps,
  input: WebhookInput,
  payload: WorkflowRunEvent,
  now: () => Date,
): Promise<Handled> {
  const row = await knownRepository(
    deps,
    payload.repository,
    payload.installation?.id,
    now,
  );
  if (!row) return ignored('unknown_repository', payload.installation?.id);

  const run = mapWorkflowRun(payload.workflow_run, row.id);
  await upsertWorkflowRun(deps.db, run);
  await pruneWorkflowRuns(deps.db, row.id);
  // A pending automation run for this commit can re-check its CI now.
  await wakeRuns(deps.db, row.id, run.headSha, now());

  const ci = computeCiState(
    await listDefaultBranchRuns(deps.db, row.id, row.default_branch),
  );
  await applyCi(deps.db, row.id, ci, now().toISOString());

  // CI "passed"/"failed" is a property of the whole commit, not of one run:
  // announce it only when the recomputed state of the default branch reaches a
  // verdict it did not already have for that commit. A run finishing while
  // other workflows are still going moves nothing.
  const events: DomainEvent[] = [];
  const changed = row.ci_state !== ci.state || row.ci_sha !== ci.sha;
  if (changed && ci.sha && (ci.state === 'success' || ci.state === 'failure')) {
    const base = {
      repositoryId: row.id,
      repositoryFullName: payload.repository.full_name,
      installationId: payload.installation?.id ?? row.installation_id,
      occurredAt: run.updatedAt,
      actor: payload.sender?.login ?? null,
      url: run.htmlUrl,
    };
    const short = ci.sha.slice(0, 7);
    events.push(
      ci.state === 'success'
        ? {
            type: 'repository.ci.passed',
            ...base,
            summary: `CI passed on ${row.default_branch} (${short})`,
            data: { branch: row.default_branch, sha: ci.sha },
          }
        : {
            type: 'repository.ci.failed',
            ...base,
            summary: `CI failed on ${row.default_branch} (${short}): ${run.name}`,
            data: {
              branch: row.default_branch,
              sha: ci.sha,
              workflow: run.name,
            },
          },
    );
  }
  await deps.sink.publish(events, input.deliveryId);
  return {
    result: 'processed',
    repositoryId: row.id,
    installationId: payload.installation?.id,
  };
}

async function handleRelease(
  deps: WebhookDeps,
  input: WebhookInput,
  payload: ReleaseEvent,
  now: () => Date,
): Promise<Handled> {
  const row = await knownRepository(
    deps,
    payload.repository,
    payload.installation?.id,
    now,
  );
  if (!row) return ignored('unknown_repository', payload.installation?.id);

  if (payload.action === 'deleted' || payload.action === 'unpublished') {
    await deleteRelease(deps.db, payload.release.id);
  } else {
    const record = mapRelease(payload.release, row.id);
    if (!record) return ignored('draft_release', payload.installation?.id);
    await upsertRelease(deps.db, record);
    await pruneReleases(deps.db, row.id);
  }

  const stored = await listReleasesFor(deps.db, row.id);
  await applyVersion(
    deps.db,
    row.id,
    pickVersion(
      stored.map((r) => ({
        id: r.id,
        repositoryId: r.repository_id,
        tagName: r.tag_name,
        name: r.name,
        prerelease: r.prerelease === 1,
        htmlUrl: r.html_url,
        authorLogin: r.author_login,
        publishedAt: r.published_at,
      })),
      null,
    ),
  );

  await deps.sink.publish(
    normalizeRelease(payload, now().toISOString()),
    input.deliveryId,
  );
  return {
    result: 'processed',
    repositoryId: row.id,
    installationId: payload.installation?.id,
  };
}

async function handleInstallation(
  deps: WebhookDeps,
  input: WebhookInput,
  payload: InstallationPayload,
  now: () => Date,
): Promise<Handled> {
  const id = payload.installation.id;
  const stamp = now().toISOString();

  switch (payload.action) {
    case 'created': {
      const record = mapInstallation(payload.installation);
      if (!record) return ignored('installation_without_account', id);
      await upsertInstallation(deps.db, record, stamp);
      deps.scheduleSync(id);
      break;
    }
    case 'deleted':
      await deleteInstallation(deps.db, id);
      break;
    case 'suspend':
      await setInstallationSuspended(
        deps.db,
        id,
        payload.installation.suspended_at ?? stamp,
        stamp,
      );
      break;
    case 'unsuspend':
      await setInstallationSuspended(deps.db, id, null, stamp);
      deps.scheduleSync(id);
      break;
    case 'new_permissions_accepted':
      deps.scheduleSync(id);
      break;
    default:
      return ignored('unsupported_action', id);
  }

  await deps.sink.publish(
    normalizeInstallation(payload, stamp),
    input.deliveryId,
  );
  return { result: 'processed', installationId: id };
}

async function handleInstallationRepositories(
  deps: WebhookDeps,
  input: WebhookInput,
  payload: InstallationRepositoriesPayload,
  now: () => Date,
): Promise<Handled> {
  const id = payload.installation.id;
  const stamp = now().toISOString();

  const record = mapInstallation(payload.installation);
  if (!record) return ignored('installation_without_account', id);
  await upsertInstallation(deps.db, record, stamp);

  for (const removed of payload.repositories_removed ?? []) {
    await deleteRepository(deps.db, removed.id);
  }
  if ((payload.repositories_added ?? []).length > 0) deps.scheduleSync(id);

  await deps.sink.publish(
    normalizeInstallationRepositories(payload, stamp),
    input.deliveryId,
  );
  return { result: 'processed', installationId: id };
}
