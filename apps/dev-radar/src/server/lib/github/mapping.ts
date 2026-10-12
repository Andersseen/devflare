import type {
  HeadCommitRecord,
  PullRequestRecord,
  ReleaseRecord,
  RepositoryRecord,
  VersionRecord,
  WorkflowRunRecord,
  InstallationRecord,
} from '../store/types';
import type {
  GhCommit,
  GhInstallation,
  GhPullRequest,
  GhRelease,
  GhRepository,
  GhWorkflowRun,
} from './types';

/** GitHub JSON -> DevRadar records. Pure; the only place that knows both shapes. */

const MESSAGE_LIMIT = 200;

export function firstLine(message: string | null | undefined): string | null {
  if (!message) return null;
  const line = message.split('\n', 1)[0].trim();
  if (!line) return null;
  return line.length > MESSAGE_LIMIT
    ? `${line.slice(0, MESSAGE_LIMIT - 1)}…`
    : line;
}

export function mapInstallation(gh: GhInstallation): InstallationRecord | null {
  // An installation without an account cannot be labelled or reasoned about.
  if (!gh.account) return null;
  return {
    id: gh.id,
    accountId: gh.account.id,
    accountLogin: gh.account.login,
    accountType: gh.account.type ?? 'User',
    repositorySelection: gh.repository_selection,
    suspendedAt: gh.suspended_at,
  };
}

export function mapRepository(
  gh: GhRepository,
  installationId: number,
): RepositoryRecord {
  return {
    id: gh.id,
    installationId,
    ownerLogin: gh.owner.login,
    name: gh.name,
    fullName: gh.full_name,
    htmlUrl: gh.html_url,
    description: gh.description,
    private: gh.private,
    archived: gh.archived,
    defaultBranch: gh.default_branch,
    pushedAt: gh.pushed_at,
  };
}

export function mapCommit(gh: GhCommit): HeadCommitRecord {
  return {
    sha: gh.sha,
    message: firstLine(gh.commit.message),
    author: gh.author?.login ?? gh.commit.author?.name ?? null,
    committedAt: gh.commit.committer?.date ?? gh.commit.author?.date ?? null,
  };
}

export function mapPullRequest(
  gh: GhPullRequest,
  repositoryId: number,
): PullRequestRecord {
  return {
    id: gh.id,
    repositoryId,
    number: gh.number,
    title: gh.title,
    authorLogin: gh.user?.login ?? null,
    draft: gh.draft === true,
    htmlUrl: gh.html_url,
    baseRef: gh.base.ref,
    headRef: gh.head.ref,
    headSha: gh.head.sha,
    labels: gh.labels.map((label) => label.name),
    createdAt: gh.created_at,
    updatedAt: gh.updated_at,
  };
}

export function mapWorkflowRun(
  gh: GhWorkflowRun,
  repositoryId: number,
): WorkflowRunRecord {
  return {
    id: gh.id,
    repositoryId,
    workflowId: gh.workflow_id,
    name: gh.name ?? `Workflow ${gh.workflow_id}`,
    event: gh.event,
    branch: gh.head_branch,
    headSha: gh.head_sha,
    // GitHub types status as nullable; an unknown status is "not finished".
    status: gh.status ?? 'queued',
    conclusion: gh.conclusion,
    runNumber: gh.run_number,
    runAttempt: gh.run_attempt ?? 1,
    htmlUrl: gh.html_url,
    createdAt: gh.created_at,
    updatedAt: gh.updated_at,
  };
}

/** Drafts (and anything unpublished) are not releases yet: null. */
export function mapRelease(
  gh: GhRelease,
  repositoryId: number,
): ReleaseRecord | null {
  if (gh.draft || !gh.published_at) return null;
  return {
    id: gh.id,
    repositoryId,
    tagName: gh.tag_name,
    name: gh.name,
    prerelease: gh.prerelease,
    htmlUrl: gh.html_url,
    authorLogin: gh.author?.login ?? null,
    publishedAt: gh.published_at,
  };
}

/**
 * The repository's version: the latest stable release, else the latest
 * pre-release, else the newest tag. `releases` must already be mapped (drafts
 * gone) and sorted newest first, which is what GitHub returns.
 */
export function pickVersion(
  releases: readonly ReleaseRecord[],
  tag: string | null,
): VersionRecord | null {
  const release = releases.find((r) => !r.prerelease) ?? releases[0];
  if (release) {
    return {
      value: release.tagName,
      source: 'release',
      at: release.publishedAt,
    };
  }
  return tag ? { value: tag, source: 'tag', at: null } : null;
}
