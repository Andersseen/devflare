-- Spec 023: repository automation rules, durable automation runs and the
-- Prompt Inbox.
--
--   automation_rule     one opt-in recipe per (user, repository): "when the
--                       default branch changes and CI passes for that commit,
--                       prepare a development prompt". Nothing is enabled by
--                       following a repository.
--   automation_run      one durable unit of work bound to an exact
--                       (repository id, branch, SHA). D1 is the source of truth;
--                       the scheduled processor claims runs with a lease.
--   development_prompt  the deterministic, contextual prompt a run (or a manual
--                       request) produced, with the context snapshot it was
--                       built from.
--
-- `repository_id` is GitHub's stable id and, as in 0001, deliberately NOT a
-- foreign key: a repository that leaves and re-enters the installation keeps
-- its rule and its prompt history. Readers join `repositories` where they need
-- live data.
--
-- Apply with:
--   pnpm cf:radar d1 migrations apply DB --local
--   pnpm cf:radar d1 migrations apply DB --env production --remote

CREATE TABLE IF NOT EXISTS automation_rule (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL,
	repository_id INTEGER NOT NULL,
	type TEXT NOT NULL DEFAULT 'next_development_prompt'
		CHECK (type IN ('next_development_prompt')),
	enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
	-- NULL = follow the repository's default branch (the only mode in v0.2.0).
	branch TEXT,
	ci_policy TEXT NOT NULL DEFAULT 'all_workflows'
		CHECK (ci_policy IN ('all_workflows', 'required_workflows')),
	-- JSON array of GitHub workflow ids; used by 'required_workflows'.
	required_workflow_ids TEXT NOT NULL DEFAULT '[]',
	-- Debounce after a default-branch update before CI is evaluated.
	settle_seconds INTEGER NOT NULL DEFAULT 120
		CHECK (settle_seconds BETWEEN 0 AND 3600),
	-- Minimum time between two automatic preparations.
	cooldown_minutes INTEGER NOT NULL DEFAULT 0
		CHECK (cooldown_minutes BETWEEN 0 AND 1440),
	-- Optional user-owned ChatGPT conversation link (navigation only).
	chatgpt_url TEXT,
	last_triggered_sha TEXT,
	last_triggered_at TEXT,
	last_prepared_sha TEXT,
	last_prepared_at TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	UNIQUE (user_id, repository_id, type),
	FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_automation_rule_repo ON automation_rule (repository_id, enabled);

CREATE TABLE IF NOT EXISTS automation_run (
	id TEXT PRIMARY KEY,
	-- NULL for a manual run of a repository that has no rule.
	rule_id TEXT,
	user_id TEXT NOT NULL,
	repository_id INTEGER NOT NULL,
	-- Names at trigger time, so history stays readable after a rename/removal.
	repository_full_name TEXT NOT NULL,
	branch TEXT NOT NULL,
	sha TEXT NOT NULL,
	trigger TEXT NOT NULL CHECK (trigger IN ('automatic', 'manual')),
	ci_bypassed INTEGER NOT NULL DEFAULT 0 CHECK (ci_bypassed IN (0, 1)),
	status TEXT NOT NULL
		CHECK (status IN ('pending', 'running', 'succeeded', 'superseded', 'expired', 'failed', 'skipped')),
	reason TEXT,                           -- machine code, see src/shared/automation.ts
	detail TEXT,                           -- one human sentence, no secrets
	attempts INTEGER NOT NULL DEFAULT 0,
	-- A pending run is due when BOTH are in the past: not_before is the settle
	-- floor, next_check_at the schedule (a workflow_run webhook pulls it forward).
	not_before TEXT NOT NULL,
	next_check_at TEXT NOT NULL,
	expires_at TEXT NOT NULL,
	-- Claim: a processor owns the run until lease_until; the token proves which.
	lease_until TEXT,
	lease_token TEXT,
	-- Last GitHub read of this commit's workflow runs (heals a missed webhook).
	ci_refreshed_at TEXT,
	-- JSON: the gate result that was last computed, shown in history.
	ci_summary TEXT,
	push_commits INTEGER,
	prompt_id TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	finished_at TEXT,
	FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE,
	FOREIGN KEY (rule_id) REFERENCES automation_rule(id) ON DELETE SET NULL
);

-- At most one automatic run per rule and commit: webhook redelivery, replayed
-- events and processor retries cannot create a second one.
CREATE UNIQUE INDEX IF NOT EXISTS uq_automation_run_auto_sha
	ON automation_run (rule_id, sha) WHERE trigger = 'automatic';
-- One manual preparation in flight per user and repository (double clicks).
CREATE UNIQUE INDEX IF NOT EXISTS uq_automation_run_manual_inflight
	ON automation_run (user_id, repository_id)
	WHERE trigger = 'manual' AND status IN ('pending', 'running');
CREATE INDEX IF NOT EXISTS idx_automation_run_due ON automation_run (status, next_check_at);
CREATE INDEX IF NOT EXISTS idx_automation_run_user_repo
	ON automation_run (user_id, repository_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_run_repo_sha ON automation_run (repository_id, sha);

CREATE TABLE IF NOT EXISTS development_prompt (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL,
	repository_id INTEGER NOT NULL,
	repository_full_name TEXT NOT NULL,
	run_id TEXT,
	branch TEXT NOT NULL,
	sha TEXT NOT NULL,
	trigger TEXT NOT NULL CHECK (trigger IN ('automatic', 'manual')),
	ci_bypassed INTEGER NOT NULL DEFAULT 0 CHECK (ci_bypassed IN (0, 1)),
	-- 1 for an automatic prompt; manual regenerations count up per commit.
	revision INTEGER NOT NULL DEFAULT 1,
	ci_state TEXT NOT NULL,                -- success | failure | pending | none | unknown | bypassed
	summary TEXT NOT NULL,                 -- short, one line, for the inbox list
	prompt TEXT NOT NULL,
	context TEXT NOT NULL,                 -- JSON snapshot the prompt was built from
	status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'dismissed')),
	created_at TEXT NOT NULL,
	read_at TEXT,
	FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE,
	FOREIGN KEY (run_id) REFERENCES automation_run(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_development_prompt_run ON development_prompt (run_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_development_prompt_auto_sha
	ON development_prompt (user_id, repository_id, sha) WHERE trigger = 'automatic';
CREATE INDEX IF NOT EXISTS idx_development_prompt_user ON development_prompt (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_development_prompt_repo ON development_prompt (user_id, repository_id, created_at DESC);
