import type { CiState } from './ci-state';
import type { DomainEventType } from './domain-events';

/** Wire shapes between DevRadar's API and its dashboard. */

export interface RepositoryDto {
  id: number;
  fullName: string;
  name: string;
  owner: string;
  htmlUrl: string;
  description: string | null;
  private: boolean;
  archived: boolean;
  defaultBranch: string;
  head: {
    sha: string;
    message: string | null;
    author: string | null;
    committedAt: string | null;
  } | null;
  ci: { state: CiState; sha: string | null; updatedAt: string | null };
  /** CI was evaluated on a different commit than the branch head. */
  ciStale: boolean;
  openPullRequests: number;
  version: {
    value: string;
    source: 'release' | 'tag';
    at: string | null;
  } | null;
  lastSyncedAt: string | null;
}

export interface PullRequestDto {
  id: number;
  number: number;
  title: string;
  repositoryId: number;
  repositoryFullName: string;
  author: string | null;
  draft: boolean;
  htmlUrl: string;
  baseRef: string;
  headRef: string;
  labels: string[];
  /** Workflow-run state of the PR's head commit. */
  ci: CiState;
  /** Set only when a label or branch convention says so — never guessed. */
  releaseHint: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRunDto {
  id: number;
  name: string;
  event: string;
  branch: string | null;
  headSha: string;
  status: string;
  conclusion: string | null;
  runNumber: number;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReleaseDto {
  id: number;
  repositoryId: number;
  repositoryFullName: string;
  tag: string;
  name: string | null;
  prerelease: boolean;
  htmlUrl: string;
  publishedAt: string;
}

export interface ActivityDto {
  id: number;
  type: DomainEventType;
  summary: string;
  actor: string | null;
  url: string | null;
  repositoryId: number | null;
  repositoryFullName: string | null;
  occurredAt: string;
}

export interface InstallationDto {
  id: number;
  account: string;
  accountType: string;
  repositorySelection: string;
  suspended: boolean;
  repositories: number;
  lastSyncedAt: string | null;
  syncError: string | null;
}

/** Whether DevRadar can talk to GitHub at all, and what is missing. */
export interface ConnectionDto {
  configured: boolean;
  /** Names of the missing settings; never their values. */
  missing: string[];
  installUrl: string | null;
  webhookConfigured: boolean;
}

export interface OverviewDto {
  connection: ConnectionDto;
  totals: {
    repositories: number;
    openPullRequests: number;
    failing: number;
    pending: number;
    noCi: number;
  };
  attention: RepositoryDto[];
  recentReleases: ReleaseDto[];
  recentActivity: ActivityDto[];
  lastSyncedAt: string | null;
}

export interface RepositoryDetailDto {
  repository: RepositoryDto;
  pullRequests: PullRequestDto[];
  workflowRuns: WorkflowRunDto[];
  releases: ReleaseDto[];
  activity: ActivityDto[];
}

export interface SettingsDto {
  connection: ConnectionDto;
  installations: InstallationDto[];
  repositories: number;
  lastSyncedAt: string | null;
  /** Public, non-secret URLs to paste into the GitHub App settings. */
  setup: { webhookUrl: string; callbackNote: string };
}

export interface SyncResultDto {
  installations: number;
  repositoriesSynced: number;
  repositoriesRemaining: number;
  errors: string[];
}
