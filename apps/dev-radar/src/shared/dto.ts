import type { CiState } from './ci-state';
import type { DomainEventType } from './domain-events';
import type {
  AutomationState,
  CiPolicy,
  PromptStatus,
  RunReason,
  RunStatus,
  RunTrigger,
} from './automation';
import type { RepositoryContext } from './prompt-context';

/** Wire shapes between DevRadar's API and its dashboard. */

export interface RepositoryDto {
  id: number;
  /** The signed-in user follows it (shown on their dashboard, counted in totals). */
  followed: boolean;
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
    /** Followed repositories — every other total is over these only. */
    repositories: number;
    /** Everything the GitHub App installation can read. */
    availableRepositories: number;
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
  /** Installed: every repository the installations can read. */
  repositories: number;
  /** Followed by the signed-in user. */
  followedRepositories: number;
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

/** Stored layout; item ids are repository ids as strings. */
export interface DashboardLayoutDto {
  layout: {
    groups: { id: string; name: string; itemIds: string[] }[];
    ungroupedIds: string[];
    hiddenIds: string[];
    pinnedIds: string[];
  };
}

// ---- Automation + Prompt Inbox (spec 023) --------------------------------------

export interface AutomationRunDto {
  id: string;
  sha: string;
  branch: string;
  trigger: RunTrigger;
  ciBypassed: boolean;
  status: RunStatus;
  reason: RunReason | null;
  detail: string | null;
  attempts: number;
  /** When a waiting run will be looked at next. */
  nextCheckAt: string | null;
  promptId: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface AutomationRuleDto {
  repositoryId: number;
  repositoryFullName: string;
  /** The repository is still mirrored (the installation can read it). */
  repositoryAvailable: boolean;
  followed: boolean;
  enabled: boolean;
  state: AutomationState;
  /** The branch the rule watches: always the repository's default branch. */
  branch: string;
  ciPolicy: CiPolicy;
  requiredWorkflowIds: number[];
  settleSeconds: number;
  cooldownMinutes: number;
  chatgptUrl: string | null;
  lastTriggeredSha: string | null;
  lastTriggeredAt: string | null;
  lastPreparedSha: string | null;
  lastPreparedAt: string | null;
  latestRun: AutomationRunDto | null;
}

export interface AutomationsDto {
  /** The GitHub App is configured, so preparation can read repositories. */
  githubConfigured: boolean;
  rules: AutomationRuleDto[];
  /** Followed repositories without a rule yet. */
  eligible: {
    id: number;
    fullName: string;
    defaultBranch: string;
    ciState: string;
  }[];
  unreadPrompts: number;
}

export interface AutomationDetailDto {
  githubConfigured: boolean;
  repository: {
    id: number;
    fullName: string;
    htmlUrl: string;
    defaultBranch: string;
    followed: boolean;
  };
  /** null until the user saves a rule for this repository. */
  rule: AutomationRuleDto | null;
  /** Workflows DevRadar has seen, to pick required ones from. */
  workflows: { id: number; name: string }[];
  runs: AutomationRunDto[];
}

export interface PromptSummaryDto {
  id: string;
  repositoryId: number;
  repositoryFullName: string;
  branch: string;
  sha: string;
  trigger: RunTrigger;
  ciBypassed: boolean;
  revision: number;
  ciState: string;
  summary: string;
  status: PromptStatus;
  createdAt: string;
}

export interface PromptDetailDto extends PromptSummaryDto {
  prompt: string;
  context: RepositoryContext;
  repositoryUrl: string | null;
  commitUrl: string | null;
  chatgptUrl: string | null;
  run: AutomationRunDto | null;
}

export interface PromptListDto {
  prompts: PromptSummaryDto[];
  unread: number;
}

export type ManualPrepareDto =
  | { ok: true; promptId: string }
  | { ok: false; code: string; message: string };
