/**
 * The slices of GitHub's REST/webhook payloads DevRadar reads. Declared by
 * hand and deliberately partial: anything not listed here is not used, and a
 * field GitHub adds later cannot break the mapping.
 */

export interface GhAccount {
  id: number;
  login: string;
  type?: string;
}

export interface GhInstallation {
  id: number;
  account: GhAccount | null;
  repository_selection: 'all' | 'selected';
  suspended_at: string | null;
}

export interface GhRepository {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  html_url: string;
  description: string | null;
  private: boolean;
  archived: boolean;
  default_branch: string;
  pushed_at: string | null;
}

export interface GhCommit {
  sha: string;
  commit: {
    message: string;
    author: { name: string; date: string } | null;
    committer: { date: string } | null;
  };
  author: { login: string } | null;
}

export interface GhPullRequest {
  id: number;
  number: number;
  state: 'open' | 'closed';
  title: string;
  draft?: boolean;
  merged?: boolean;
  html_url: string;
  user: { login: string } | null;
  labels: { name: string }[];
  base: { ref: string };
  head: { ref: string; sha: string };
  created_at: string;
  updated_at: string;
}

export interface GhWorkflowRun {
  id: number;
  workflow_id: number;
  name: string | null;
  event: string;
  head_branch: string | null;
  head_sha: string;
  status: string | null;
  conclusion: string | null;
  run_number: number;
  run_attempt?: number;
  html_url: string;
  created_at: string;
  updated_at: string;
}

export interface GhRelease {
  id: number;
  tag_name: string;
  name: string | null;
  draft: boolean;
  prerelease: boolean;
  html_url: string;
  author: { login: string } | null;
  published_at: string | null;
  created_at: string;
}

export interface GhTag {
  name: string;
}
