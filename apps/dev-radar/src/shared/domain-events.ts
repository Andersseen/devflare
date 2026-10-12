/**
 * Normalized domain events. GitHub's webhook vocabulary stops at the webhook
 * boundary (src/server/lib/webhooks/normalize.ts); everything past it — the
 * Activity feed today, an automation engine later — sees only these.
 *
 * The type strings are a contract: a future rule engine subscribes to them, so
 * renaming one is a breaking change.
 */

export interface EventSubject {
  /** GitHub repository id (stable across renames); null for installation-wide events. */
  repositoryId: number | null;
  repositoryFullName: string | null;
  installationId: number | null;
}

interface Base extends EventSubject {
  /** When it happened on GitHub (ISO). */
  occurredAt: string;
  /** Who caused it, when GitHub says. */
  actor: string | null;
  url: string | null;
  /** One human-readable line for the feed. */
  summary: string;
}

export interface MainUpdated extends Base {
  type: 'repository.main.updated';
  data: {
    branch: string;
    headSha: string;
    commits: number;
    headMessage: string | null;
  };
}

/** Only emitted when *all* counted workflows of the commit have concluded. */
export interface CiPassed extends Base {
  type: 'repository.ci.passed';
  data: { branch: string; sha: string };
}

export interface CiFailed extends Base {
  type: 'repository.ci.failed';
  data: { branch: string; sha: string; workflow: string };
}

export interface PullRequestOpened extends Base {
  type: 'pull_request.opened';
  data: { number: number; title: string; draft: boolean };
}

export interface PullRequestMerged extends Base {
  type: 'pull_request.merged';
  data: { number: number; title: string; baseRef: string };
}

export interface PullRequestClosed extends Base {
  type: 'pull_request.closed';
  data: { number: number; title: string };
}

export interface ReleasePublished extends Base {
  type: 'release.published';
  data: { tag: string; name: string | null; prerelease: boolean };
}

export interface InstallationCreated extends Base {
  type: 'installation.created';
  data: { account: string };
}

export interface InstallationDeleted extends Base {
  type: 'installation.deleted';
  data: { account: string };
}

export interface RepositoryAdded extends Base {
  type: 'repository.added';
  data: Record<string, never>;
}

export interface RepositoryRemoved extends Base {
  type: 'repository.removed';
  data: Record<string, never>;
}

export type DomainEvent =
  | MainUpdated
  | CiPassed
  | CiFailed
  | PullRequestOpened
  | PullRequestMerged
  | PullRequestClosed
  | ReleasePublished
  | InstallationCreated
  | InstallationDeleted
  | RepositoryAdded
  | RepositoryRemoved;

export type DomainEventType = DomainEvent['type'];

export const DOMAIN_EVENT_LABEL: Record<DomainEventType, string> = {
  'repository.main.updated': 'Default branch updated',
  'repository.ci.passed': 'CI passed',
  'repository.ci.failed': 'CI failed',
  'pull_request.opened': 'Pull request opened',
  'pull_request.merged': 'Pull request merged',
  'pull_request.closed': 'Pull request closed',
  'release.published': 'Release published',
  'installation.created': 'App installed',
  'installation.deleted': 'App uninstalled',
  'repository.added': 'Repository added',
  'repository.removed': 'Repository removed',
};

/**
 * Where domain events go. v0.1.0 has one implementation (persist to the
 * Activity feed); the v0.2.0 automation engine adds another next to it.
 */
export interface DomainEventSink {
  publish(
    events: readonly DomainEvent[],
    deliveryId: string | null,
  ): Promise<void>;
}
