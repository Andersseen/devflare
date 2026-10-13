// Seeds DevRadar's LOCAL D1 with deterministic fixtures for the E2E suite:
// two signed-in sessions (one allowlisted, one not) and a small, clearly
// synthetic GitHub mirror ("e2e-org"). It is test data for a local database —
// DevRadar's own code has no mock mode and never fabricates repository data.
//
// Run by playwright.config.ts after the migrations are applied. Idempotent.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '../../../..');
const OWNER = 'e2e-owner-session-token-0000000000000000000';
const BLOCKED = 'e2e-blocked-session-token-000000000000000000';
const hash = (token) => createHash('sha256').update(token).digest('hex');

const now = Date.now();
const ago = (minutes) => new Date(now - minutes * 60_000).toISOString();
const q = (value) =>
  value === null || value === undefined
    ? 'NULL'
    : typeof value === 'number'
      ? String(value)
      : `'${String(value).replace(/'/g, "''")}'`;

const insert = (table, row) =>
  `INSERT INTO ${table} (${Object.keys(row).join(', ')}) VALUES (${Object.values(row).map(q).join(', ')});`;

const repo = (over) => ({
  installation_id: 10,
  owner_login: 'e2e-org',
  description: null,
  private: 0,
  archived: 0,
  default_branch: 'main',
  pushed_at: ago(60),
  head_sha: null,
  head_message: null,
  head_author: null,
  head_committed_at: null,
  ci_state: 'unknown',
  ci_sha: null,
  ci_updated_at: null,
  open_pr_count: 0,
  version: null,
  version_source: null,
  version_at: null,
  last_synced_at: ago(5),
  created_at: ago(1000),
  updated_at: ago(5),
  html_url: `https://github.com/e2e-org/${over.name}`,
  full_name: `e2e-org/${over.name}`,
  ...over,
});

const statements = [
  'PRAGMA foreign_keys = ON;',
  ...[
    'followed_repository',
    'dashboard_group',
    'repository_events',
    'webhook_deliveries',
    'releases',
    'workflow_runs',
    'pull_requests',
    'repositories',
    'github_installations',
    'app_session',
    'app_user',
  ].map((t) => `DELETE FROM ${t};`),

  insert('app_user', {
    id: 'e2e-owner',
    email: 'test@devflare.com',
    name: 'E2E Owner',
    image: null,
    created_at: ago(100),
    updated_at: ago(100),
  }),
  insert('app_user', {
    id: 'e2e-blocked',
    email: 'blocked@example.com',
    name: 'Blocked User',
    image: null,
    created_at: ago(100),
    updated_at: ago(100),
  }),
  insert('app_session', {
    token_hash: hash(OWNER),
    user_id: 'e2e-owner',
    expires_at: new Date(now + 7 * 86_400_000).toISOString(),
    created_at: ago(1),
  }),
  insert('app_session', {
    token_hash: hash(BLOCKED),
    user_id: 'e2e-blocked',
    expires_at: new Date(now + 7 * 86_400_000).toISOString(),
    created_at: ago(1),
  }),

  insert('github_installations', {
    id: 10,
    account_id: 100,
    account_login: 'e2e-org',
    account_type: 'Organization',
    repository_selection: 'all',
    suspended_at: null,
    last_synced_at: ago(5),
    sync_error: null,
    created_at: ago(1000),
    updated_at: ago(5),
  }),

  // Failing CI, two open PRs (one a documented release PR), a stable release.
  insert(
    'repositories',
    repo({
      id: 1001,
      name: 'api',
      description: 'Billing API',
      head_sha: 'a1b2c3d4e5f6a7b8',
      head_message: 'fix: round invoice totals',
      head_author: 'ada',
      head_committed_at: ago(90),
      ci_state: 'failure',
      ci_sha: 'a1b2c3d4e5f6a7b8',
      ci_updated_at: ago(80),
      open_pr_count: 2,
      version: 'v1.4.0',
      version_source: 'release',
      version_at: ago(3000),
    }),
  ),
  // Passing CI, private.
  insert(
    'repositories',
    repo({
      id: 1002,
      name: 'web',
      private: 1,
      description: 'Customer dashboard',
      head_sha: 'ffeeddccbbaa9988',
      head_message: 'feat: dark mode',
      head_author: 'grace',
      head_committed_at: ago(30),
      ci_state: 'success',
      ci_sha: 'ffeeddccbbaa9988',
      ci_updated_at: ago(20),
      open_pr_count: 1,
      version: 'v2.0.1',
      version_source: 'tag',
    }),
  ),
  // No workflows at all: must read "No CI", never "Passing".
  insert(
    'repositories',
    repo({
      id: 1003,
      name: 'docs',
      description: 'Handbook',
      head_sha: '1122334455667788',
      head_message: 'docs: typo',
      head_author: 'linus',
      head_committed_at: ago(600),
      ci_state: 'none',
    }),
  ),
  // Archived: hidden by default.
  insert(
    'repositories',
    repo({
      id: 1004,
      name: 'legacy',
      archived: 1,
      description: 'Retired service',
      ci_state: 'success',
      ci_sha: '0000',
    }),
  ),

  // The owner follows all four, alphabetical: the dashboard specs read totals
  // over the followed set. Customization specs change and then restore this.
  ...[1001, 1003, 1004, 1002].map((repository_id, position) =>
    insert('followed_repository', {
      user_id: 'e2e-owner',
      repository_id,
      group_id: null,
      position,
      pinned: 0,
      created_at: ago(100),
    }),
  ),

  insert('pull_requests', {
    id: 5001,
    repository_id: 1001,
    number: 41,
    title: 'Add retry to invoice sender',
    author_login: 'ada',
    draft: 0,
    html_url: 'https://github.com/e2e-org/api/pull/41',
    base_ref: 'main',
    head_ref: 'feature/retry',
    head_sha: 'pr41sha',
    labels: JSON.stringify(['enhancement']),
    created_at: ago(500),
    updated_at: ago(45),
  }),
  insert('pull_requests', {
    id: 5002,
    repository_id: 1001,
    number: 42,
    title: 'chore(main): release 1.5.0',
    author_login: 'release-bot',
    draft: 0,
    html_url: 'https://github.com/e2e-org/api/pull/42',
    base_ref: 'main',
    head_ref: 'release-please--branches--main',
    head_sha: 'pr42sha',
    labels: JSON.stringify(['autorelease: pending']),
    created_at: ago(300),
    updated_at: ago(40),
  }),
  insert('pull_requests', {
    id: 5003,
    repository_id: 1002,
    number: 7,
    title: 'WIP: prepare release notes',
    author_login: 'grace',
    draft: 1,
    html_url: 'https://github.com/e2e-org/web/pull/7',
    base_ref: 'main',
    head_ref: 'prepare-release',
    head_sha: 'pr7sha',
    labels: '[]',
    created_at: ago(200),
    updated_at: ago(100),
  }),

  insert('workflow_runs', {
    id: 7001,
    repository_id: 1001,
    workflow_id: 1,
    name: 'CI',
    event: 'push',
    branch: 'main',
    head_sha: 'a1b2c3d4e5f6a7b8',
    status: 'completed',
    conclusion: 'failure',
    run_number: 128,
    run_attempt: 1,
    html_url: 'https://github.com/e2e-org/api/actions/runs/7001',
    created_at: ago(85),
    updated_at: ago(80),
  }),
  insert('workflow_runs', {
    id: 7002,
    repository_id: 1001,
    workflow_id: 1,
    name: 'CI',
    event: 'pull_request',
    branch: 'feature/retry',
    head_sha: 'pr41sha',
    status: 'completed',
    conclusion: 'success',
    run_number: 129,
    run_attempt: 1,
    html_url: 'https://github.com/e2e-org/api/actions/runs/7002',
    created_at: ago(50),
    updated_at: ago(45),
  }),
  insert('workflow_runs', {
    id: 7003,
    repository_id: 1002,
    workflow_id: 2,
    name: 'Build',
    event: 'push',
    branch: 'main',
    head_sha: 'ffeeddccbbaa9988',
    status: 'completed',
    conclusion: 'success',
    run_number: 55,
    run_attempt: 1,
    html_url: 'https://github.com/e2e-org/web/actions/runs/7003',
    created_at: ago(25),
    updated_at: ago(20),
  }),

  insert('releases', {
    id: 9001,
    repository_id: 1001,
    tag_name: 'v1.4.0',
    name: 'v1.4.0',
    prerelease: 0,
    html_url: 'https://github.com/e2e-org/api/releases/tag/v1.4.0',
    author_login: 'ada',
    published_at: ago(3000),
  }),

  insert('repository_events', {
    repository_id: 1001,
    repository_full_name: 'e2e-org/api',
    installation_id: 10,
    type: 'repository.ci.failed',
    summary: 'CI failed on main (a1b2c3d): CI',
    actor: 'ada',
    url: 'https://github.com/e2e-org/api/actions/runs/7001',
    data: '{}',
    delivery_id: 'seed-1',
    occurred_at: ago(80),
    created_at: ago(80),
  }),
  insert('repository_events', {
    repository_id: 1002,
    repository_full_name: 'e2e-org/web',
    installation_id: 10,
    type: 'repository.ci.passed',
    summary: 'CI passed on main (ffeeddc)',
    actor: 'grace',
    url: null,
    data: '{}',
    delivery_id: 'seed-2',
    occurred_at: ago(20),
    created_at: ago(20),
  }),
];

const dir = mkdtempSync(join(tmpdir(), 'dev-radar-e2e-'));
const file = join(dir, 'seed.sql');
writeFileSync(file, statements.join('\n'));

const result = spawnSync(
  'pnpm',
  [
    'exec',
    'wrangler',
    'd1',
    'execute',
    'DB',
    '--local',
    '--cwd',
    'apps/dev-radar',
    '--file',
    file,
  ],
  { cwd: root, stdio: 'inherit' },
);
process.exit(result.status ?? 1);
