-- Spec 022: per-user dashboard customization.
--
-- Two ideas, deliberately kept apart from the mirrored GitHub state:
--
--   * "Available" repositories are the rows of `repositories` — everything the
--     GitHub App installation can read. They are synchronized, never edited here.
--   * "Followed" repositories are the user's explicit choice of what their
--     dashboard shows and what every overview total counts. One row each.
--
-- Nothing is followed until the user says so, and a synchronization never adds
-- or removes a row here: new repositories simply appear in "available".
--
-- `repository_id` is GitHub's stable numeric id, so a rename or transfer keeps
-- the preference. It is NOT a foreign key on purpose: if a repository leaves the
-- installation (and its mirrored row is deleted) and later returns, the user's
-- choice, group and position are still there. Reads join `repositories`, so a
-- followed id with no mirrored row is invisible until it comes back.
--
-- Apply with:
--   pnpm cf:radar d1 migrations apply DB --local
--   pnpm cf:radar d1 migrations apply DB --env production --remote

CREATE TABLE IF NOT EXISTS dashboard_group (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL,
	name TEXT NOT NULL CHECK (length(trim(name)) > 0 AND length(name) <= 40),
	position INTEGER NOT NULL,
	created_at TEXT NOT NULL,
	FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_dashboard_group_user ON dashboard_group (user_id, position);

CREATE TABLE IF NOT EXISTS followed_repository (
	user_id TEXT NOT NULL,
	repository_id INTEGER NOT NULL,       -- GitHub repository id (see above)
	-- Deleting a group never deletes or unfollows its repositories: they fall
	-- back to "ungrouped" (NULL).
	group_id TEXT,
	position INTEGER NOT NULL,
	pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
	created_at TEXT NOT NULL,
	PRIMARY KEY (user_id, repository_id),
	FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE,
	FOREIGN KEY (group_id) REFERENCES dashboard_group(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_followed_repository_repo ON followed_repository (repository_id);
CREATE INDEX IF NOT EXISTS idx_followed_repository_group ON followed_repository (group_id);
