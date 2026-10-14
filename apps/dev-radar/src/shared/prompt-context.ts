/**
 * The shape of the context snapshot stored with every prompt (spec 023) and
 * shown by the Prompt Inbox. Server builds it, the dashboard only reads it.
 */

export type DocumentRole = 'agents' | 'readme' | 'roadmap' | 'specs';

export interface DocumentExcerpt {
  path: string;
  role: DocumentRole;
  /** Size on GitHub, in bytes. */
  size: number;
  /** The excerpt is shorter than the file. */
  truncated: boolean;
  text: string;
}

export interface MissingItem {
  what: string;
  reason: string;
}

export type ContextCiState =
  | 'success'
  | 'failure'
  | 'pending'
  | 'none'
  | 'unknown';

export interface RepositoryContext {
  schema: 1;
  collectedAt: string;
  repository: {
    id: number;
    fullName: string;
    url: string;
    description: string | null;
    defaultBranch: string;
    private: boolean;
    version: string | null;
  };
  branch: string;
  sha: string;
  headMessage: string | null;
  /** Commits in the push that triggered this, when known. */
  pushCommits: number | null;
  ci: {
    state: ContextCiState;
    bypassed: boolean;
    detail: string;
    workflows: { name: string; outcome: string | null; url: string | null }[];
  };
  latestPullRequest: {
    number: number;
    title: string;
    url: string;
    author: string | null;
    mergedAt: string;
    body: string | null;
  } | null;
  recentCommits: {
    sha: string;
    message: string;
    author: string | null;
    date: string | null;
  }[];
  changedFiles: { paths: string[]; total: number } | null;
  documents: DocumentExcerpt[];
  missing: MissingItem[];
}
