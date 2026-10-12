import type { DomainEvent } from '../../../shared/domain-events';
import { firstLine } from '../github/mapping';
import type {
  InstallationPayload,
  InstallationRepositoriesPayload,
  PullRequestEvent,
  PushEvent,
  ReleaseEvent,
  WebhookRepository,
} from './payloads';

/**
 * GitHub webhook payloads -> DomainEvents. Pure: no I/O, no state. GitHub's
 * vocabulary ends here; the Activity feed and any future automation see only
 * the normalized events (src/shared/domain-events.ts).
 *
 * CI events (`repository.ci.passed|failed`) are not produced here: whether a
 * workflow_run means "CI passed" depends on the *other* workflows of the same
 * commit, so process.ts derives them from the recomputed repository state.
 */

const BRANCH_PREFIX = 'refs/heads/';

function subject(
  repository: WebhookRepository | undefined,
  installationId: number | undefined,
) {
  return {
    repositoryId: repository?.id ?? null,
    repositoryFullName: repository?.full_name ?? null,
    installationId: installationId ?? null,
  };
}

export function isDefaultBranchPush(payload: PushEvent): boolean {
  const branch = payload.repository.default_branch;
  return (
    !payload.deleted && !!branch && payload.ref === `${BRANCH_PREFIX}${branch}`
  );
}

export function normalizePush(payload: PushEvent, now: string): DomainEvent[] {
  if (!isDefaultBranchPush(payload)) return [];
  const branch = payload.repository.default_branch as string;
  const message = firstLine(payload.head_commit?.message);
  const commits = payload.commits?.length ?? 0;

  return [
    {
      type: 'repository.main.updated',
      ...subject(payload.repository, payload.installation?.id),
      occurredAt: payload.head_commit?.timestamp ?? now,
      actor:
        payload.pusher?.name ??
        payload.head_commit?.author?.username ??
        payload.sender?.login ??
        null,
      url: payload.head_commit?.url ?? null,
      summary: message ? `${branch} updated: ${message}` : `${branch} updated`,
      data: {
        branch,
        headSha: payload.after,
        commits,
        headMessage: message,
      },
    },
  ];
}

export function normalizePullRequest(
  payload: PullRequestEvent,
  now: string,
): DomainEvent[] {
  const pr = payload.pull_request;
  const base = {
    ...subject(payload.repository, payload.installation?.id),
    actor: payload.sender?.login ?? pr.user?.login ?? null,
    url: pr.html_url,
  };
  const label = `#${pr.number} ${pr.title}`;

  if (payload.action === 'opened') {
    return [
      {
        type: 'pull_request.opened',
        ...base,
        occurredAt: pr.created_at ?? now,
        summary: `Opened ${label}`,
        data: { number: pr.number, title: pr.title, draft: pr.draft === true },
      },
    ];
  }

  if (payload.action === 'closed') {
    if (pr.merged === true) {
      return [
        {
          type: 'pull_request.merged',
          ...base,
          occurredAt: pr.updated_at ?? now,
          summary: `Merged ${label} into ${pr.base.ref}`,
          data: { number: pr.number, title: pr.title, baseRef: pr.base.ref },
        },
      ];
    }
    return [
      {
        type: 'pull_request.closed',
        ...base,
        occurredAt: pr.updated_at ?? now,
        summary: `Closed ${label} without merging`,
        data: { number: pr.number, title: pr.title },
      },
    ];
  }

  // synchronize, edited, labeled, ready_for_review, ...: state changes, but
  // they are not events worth a feed row (or an automation trigger).
  return [];
}

export function normalizeRelease(
  payload: ReleaseEvent,
  now: string,
): DomainEvent[] {
  const release = payload.release;
  if (payload.action !== 'published' || release.draft) return [];
  return [
    {
      type: 'release.published',
      ...subject(payload.repository, payload.installation?.id),
      occurredAt: release.published_at ?? now,
      actor: release.author?.login ?? payload.sender?.login ?? null,
      url: release.html_url,
      summary: `Published ${release.name || release.tag_name}${release.prerelease ? ' (pre-release)' : ''}`,
      data: {
        tag: release.tag_name,
        name: release.name,
        prerelease: release.prerelease,
      },
    },
  ];
}

export function normalizeInstallation(
  payload: InstallationPayload,
  now: string,
): DomainEvent[] {
  const account = payload.installation.account?.login ?? 'unknown account';
  const base = {
    repositoryId: null,
    repositoryFullName: null,
    installationId: payload.installation.id,
    occurredAt: now,
    actor: payload.sender?.login ?? null,
    url: null,
  };
  if (payload.action === 'created') {
    return [
      {
        type: 'installation.created',
        ...base,
        summary: `GitHub App installed on ${account}`,
        data: { account },
      },
    ];
  }
  if (payload.action === 'deleted') {
    return [
      {
        type: 'installation.deleted',
        ...base,
        summary: `GitHub App uninstalled from ${account}`,
        data: { account },
      },
    ];
  }
  return [];
}

export function normalizeInstallationRepositories(
  payload: InstallationRepositoriesPayload,
  now: string,
): DomainEvent[] {
  const make = (
    type: 'repository.added' | 'repository.removed',
    repo: { id: number; full_name: string },
  ): DomainEvent => ({
    type,
    repositoryId: repo.id,
    repositoryFullName: repo.full_name,
    installationId: payload.installation.id,
    occurredAt: now,
    actor: payload.sender?.login ?? null,
    url: null,
    summary:
      type === 'repository.added'
        ? `${repo.full_name} added to the GitHub App`
        : `${repo.full_name} removed from the GitHub App`,
    data: {},
  });

  return [
    ...(payload.repositories_added ?? []).map((r) =>
      make('repository.added', r),
    ),
    ...(payload.repositories_removed ?? []).map((r) =>
      make('repository.removed', r),
    ),
  ];
}
