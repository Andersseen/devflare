-- DevRadar's own database (spec 021). Nothing here is shared with another app:
--   DevAuth DB   -> identity
--   DevFlare DB  -> projects / Cloudflare infrastructure metadata
--   DevTools DB  -> connected-tool state
--   DevRadar DB  -> this: DevRadar's session + the mirrored GitHub state
--
-- Apply with:
--   pnpm cf:radar d1 migrations apply DB --local
--   pnpm cf:radar d1 migrations apply DB --env production --remote
--
-- GitHub's numeric ids are the keys everywhere. Repositories get renamed and
-- transferred; `full_name` is display data that follows the id, never a key.

-- A local copy of the identity DevAuth returned at sign-in. `id` is DevAuth's `sub`.
CREATE TABLE IF NOT EXISTS app_user (
	id TEXT PRIMARY KEY,
	email TEXT NOT NULL,
	name TEXT NOT NULL,
	image TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_session (
	-- SHA-256 of the dr_session cookie, never the value.
	token_hash TEXT PRIMARY KEY,
	user_id TEXT NOT NULL,
	expires_at TEXT NOT NULL,
	created_at TEXT NOT NULL,
	FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_app_session_user_id ON app_session (user_id);
CREATE INDEX IF NOT EXISTS idx_app_session_expires_at ON app_session (expires_at);

-- One row per GitHub App installation (an account or organization that
-- installed the App). No tokens are stored: installation access tokens are
-- minted per sync, kept in memory, and expire within the hour.
CREATE TABLE IF NOT EXISTS github_installations (
	id INTEGER PRIMARY KEY,                 -- GitHub installation id
	account_id INTEGER NOT NULL,
	account_login TEXT NOT NULL,
	account_type TEXT NOT NULL,             -- 'User' | 'Organization'
	repository_selection TEXT NOT NULL,     -- 'all' | 'selected'
	suspended_at TEXT,
	last_synced_at TEXT,
	sync_error TEXT,                        -- last failure, human readable, no secrets
	-- Lease so two runs (cron + manual click + webhook) never sync one
	-- installation concurrently. Expires on its own if a run dies.
	sync_lease_until TEXT,
	-- Random per acquisition, so a caller can tell it (and not a concurrent
	-- caller in the same millisecond) took the lease.
	sync_lease_token TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS repositories (
	id INTEGER PRIMARY KEY,                 -- GitHub repository id
	installation_id INTEGER NOT NULL,
	owner_login TEXT NOT NULL,
	name TEXT NOT NULL,
	full_name TEXT NOT NULL,
	html_url TEXT NOT NULL,
	description TEXT,
	private INTEGER NOT NULL DEFAULT 0 CHECK (private IN (0, 1)),
	archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
	default_branch TEXT NOT NULL,
	pushed_at TEXT,
	-- Latest known commit on the default branch.
	head_sha TEXT,
	head_message TEXT,
	head_author TEXT,
	head_committed_at TEXT,
	-- CI of the default branch (see src/shared/ci-state.ts). `ci_sha` is the
	-- commit those runs belong to, so a stale result is visible as stale.
	ci_state TEXT NOT NULL DEFAULT 'unknown'
		CHECK (ci_state IN ('unknown', 'none', 'pending', 'success', 'failure')),
	ci_sha TEXT,
	ci_updated_at TEXT,
	open_pr_count INTEGER NOT NULL DEFAULT 0,
	-- Version: the latest published release, else the newest tag.
	version TEXT,
	version_source TEXT CHECK (version_source IN ('release', 'tag')),
	version_at TEXT,
	-- NULL until the first complete synchronization of this repository.
	last_synced_at TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	FOREIGN KEY (installation_id) REFERENCES github_installations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_repositories_installation ON repositories (installation_id);
CREATE INDEX IF NOT EXISTS idx_repositories_full_name ON repositories (full_name COLLATE NOCASE);

-- Open pull requests only: a closed or merged PR is removed (its closing is
-- recorded as an event), which keeps the table bounded by what is actually open.
CREATE TABLE IF NOT EXISTS pull_requests (
	id INTEGER PRIMARY KEY,                 -- GitHub pull request id
	repository_id INTEGER NOT NULL,
	number INTEGER NOT NULL,
	title TEXT NOT NULL,
	author_login TEXT,
	draft INTEGER NOT NULL DEFAULT 0 CHECK (draft IN (0, 1)),
	html_url TEXT NOT NULL,
	base_ref TEXT NOT NULL,
	head_ref TEXT NOT NULL,
	head_sha TEXT NOT NULL,
	labels TEXT NOT NULL DEFAULT '[]',      -- JSON array of label names
	-- GitHub's `updated_at`; webhooks arrive out of order, so writes are
	-- guarded by it and a stale delivery cannot overwrite a newer row.
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pull_requests_repo ON pull_requests (repository_id, number);
CREATE INDEX IF NOT EXISTS idx_pull_requests_updated ON pull_requests (updated_at);

-- Recent GitHub Actions runs (latest 50 per repository are kept).
CREATE TABLE IF NOT EXISTS workflow_runs (
	id INTEGER PRIMARY KEY,                 -- GitHub workflow run id
	repository_id INTEGER NOT NULL,
	workflow_id INTEGER NOT NULL,
	name TEXT NOT NULL,
	event TEXT NOT NULL,
	branch TEXT,
	head_sha TEXT NOT NULL,
	status TEXT NOT NULL,                   -- queued | in_progress | completed | ...
	conclusion TEXT,                        -- success | failure | cancelled | ... (NULL until completed)
	run_number INTEGER NOT NULL,
	run_attempt INTEGER NOT NULL DEFAULT 1,
	html_url TEXT NOT NULL,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_repo ON workflow_runs (repository_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_sha ON workflow_runs (repository_id, head_sha);

-- Published releases (latest 10 per repository). Drafts are never stored.
CREATE TABLE IF NOT EXISTS releases (
	id INTEGER PRIMARY KEY,                 -- GitHub release id
	repository_id INTEGER NOT NULL,
	tag_name TEXT NOT NULL,
	name TEXT,
	prerelease INTEGER NOT NULL DEFAULT 0 CHECK (prerelease IN (0, 1)),
	html_url TEXT NOT NULL,
	author_login TEXT,
	published_at TEXT NOT NULL,
	FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_releases_repo ON releases (repository_id, published_at DESC);

-- Webhook idempotency + compact delivery log. Rows older than 14 days are
-- pruned (src/server/lib/store/retention.ts). The payload is NOT stored.
CREATE TABLE IF NOT EXISTS webhook_deliveries (
	delivery_id TEXT PRIMARY KEY,           -- X-GitHub-Delivery
	event TEXT NOT NULL,
	action TEXT,
	installation_id INTEGER,
	repository_id INTEGER,
	status TEXT NOT NULL CHECK (status IN ('received', 'processed', 'ignored', 'failed')),
	attempts INTEGER NOT NULL DEFAULT 1,
	error TEXT,
	received_at TEXT NOT NULL,
	processed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_received ON webhook_deliveries (received_at);

-- Normalized domain events (src/shared/domain-events.ts) as shown in Activity
-- and as the subscription point for a future automation engine. Bounded: 30
-- days and at most 200 per repository.
CREATE TABLE IF NOT EXISTS repository_events (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	-- Not a foreign key: "repository removed" must outlive the repository row.
	repository_id INTEGER,
	repository_full_name TEXT,
	installation_id INTEGER,
	type TEXT NOT NULL,                     -- e.g. repository.main.updated
	summary TEXT NOT NULL,
	actor TEXT,
	url TEXT,
	-- JSON of the event's typed payload (commit sha, PR number, conclusion, ...).
	data TEXT NOT NULL DEFAULT '{}',
	delivery_id TEXT,
	occurred_at TEXT NOT NULL,
	created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_repository_events_occurred ON repository_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_repository_events_repo ON repository_events (repository_id, occurred_at DESC);
-- A redelivered or retried webhook must not duplicate its events.
CREATE UNIQUE INDEX IF NOT EXISTS uq_repository_events_delivery ON repository_events (delivery_id, type) WHERE delivery_id IS NOT NULL;
