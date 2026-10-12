import { ghInstallation, ghPull, ghRelease, ghRun } from './fake-github';

/** Webhook payload builders. Shapes follow GitHub's documented payloads. */

export const REPO = {
  id: 100,
  name: 'api',
  full_name: 'acme/api',
  html_url: 'https://github.com/acme/api',
  private: false,
  archived: false,
  default_branch: 'main',
  owner: { login: 'acme' },
};

const base = {
  installation: { id: 10 },
  repository: REPO,
  sender: { login: 'ada' },
};

export const push = (over: Record<string, unknown> = {}) => ({
  ...base,
  ref: 'refs/heads/main',
  after: 'sha-new',
  deleted: false,
  commits: [{ id: 'sha-new' }, { id: 'sha-mid' }],
  head_commit: {
    id: 'sha-new',
    message: 'feat: ship it\n\nbody',
    timestamp: '2026-10-12T11:00:00Z',
    url: 'https://github.com/acme/api/commit/sha-new',
    author: { name: 'Ada L', username: 'ada' },
  },
  pusher: { name: 'ada' },
  ...over,
});

export const pullRequest = (
  action: string,
  pr: Partial<ReturnType<typeof ghPull>> & { merged?: boolean } = {},
) => ({
  ...base,
  action,
  pull_request: {
    ...ghPull(7, { title: 'Add thing', ...pr }),
    merged: pr.merged,
  },
});

export const workflowRun = (
  action: string,
  run: Partial<ReturnType<typeof ghRun>> = {},
) => ({ ...base, action, workflow_run: ghRun(500, run) });

export const release = (
  action: string,
  rel: Partial<ReturnType<typeof ghRelease>> = {},
) => ({ ...base, action, release: ghRelease(900, 'v1.2.0', rel) });

export const installation = (action: string, id = 10, login = 'acme') => ({
  action,
  installation: ghInstallation(id, login),
  sender: { login: 'ada' },
});

export const installationRepositories = (
  action: string,
  over: Record<string, unknown> = {},
) => ({
  action,
  installation: ghInstallation(10, 'acme'),
  sender: { login: 'ada' },
  repositories_added: [],
  repositories_removed: [],
  ...over,
});
