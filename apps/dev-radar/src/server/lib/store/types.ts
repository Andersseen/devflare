import type { CiState } from '../../../shared/ci-state';

/**
 * Persistence-shaped records. GitHub's JSON is mapped into these once
 * (github/mapping.ts, webhooks/normalize.ts); the store and the sync code never
 * see a raw GitHub payload.
 */

export interface InstallationRecord {
  id: number;
  accountId: number;
  accountLogin: string;
  accountType: string;
  repositorySelection: string;
  suspendedAt: string | null;
}

export interface RepositoryRecord {
  id: number;
  installationId: number;
  ownerLogin: string;
  name: string;
  fullName: string;
  htmlUrl: string;
  description: string | null;
  private: boolean;
  archived: boolean;
  defaultBranch: string;
  pushedAt: string | null;
}

export interface HeadCommitRecord {
  sha: string;
  message: string | null;
  author: string | null;
  committedAt: string | null;
}

export interface PullRequestRecord {
  id: number;
  repositoryId: number;
  number: number;
  title: string;
  authorLogin: string | null;
  draft: boolean;
  htmlUrl: string;
  baseRef: string;
  headRef: string;
  headSha: string;
  labels: string[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRunRecord {
  id: number;
  repositoryId: number;
  workflowId: number;
  name: string;
  event: string;
  branch: string | null;
  headSha: string;
  status: string;
  conclusion: string | null;
  runNumber: number;
  runAttempt: number;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReleaseRecord {
  id: number;
  repositoryId: number;
  tagName: string;
  name: string | null;
  prerelease: boolean;
  htmlUrl: string;
  authorLogin: string | null;
  publishedAt: string;
}

export interface VersionRecord {
  value: string;
  source: 'release' | 'tag';
  at: string | null;
}

export interface CiRecord {
  state: CiState;
  sha: string | null;
}
