-- Spec 022: persistent dashboard customization.
--
-- Three things live here, and none of them is Cloudflare ownership:
--
--   dashboard_group / dashboard_item   VISUAL grouping: which cards a user
--       sees, in which named group and order, or hidden. Presentation only.
--       Moving or hiding a card never touches `project_resource`, which stays
--       the one place that says a Cloudflare resource belongs to a project.
--
--   discovery_identity                 DISCOVERY matching: the user's edits to
--       the aliases that group *unowned* Workers/Pages into suggested
--       projects. The built-in defaults (the former WATCHED_PROJECTS array)
--       stay in code and are overridden per user by these rows: an edited
--       identity, a user-defined one, or a tombstone (`removed = 1`) for a
--       default the user does not want. Verified domains are never stored
--       here: only the seeded defaults may carry them.
--
-- `itemKey` is `saved:<projects.id>` or `discovered:<slug>`. Discovered keys
-- are not foreign keys (they name suggestions, not rows); a saved key is
-- removed together with its project (project-store.ts deleteProject).
--
-- Deleting a group never deletes its items: they fall back to ungrouped.
--
-- Apply with:
--   wrangler d1 migrations apply DB --local             (dev)
--   wrangler d1 migrations apply DB --env production --remote

CREATE TABLE IF NOT EXISTS dashboard_group (
	id TEXT PRIMARY KEY,
	userId TEXT NOT NULL,
	name TEXT NOT NULL CHECK (length(trim(name)) > 0 AND length(name) <= 40),
	position INTEGER NOT NULL,
	createdAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dashboard_group_user ON dashboard_group (userId, position);

CREATE TABLE IF NOT EXISTS dashboard_item (
	userId TEXT NOT NULL,
	itemKey TEXT NOT NULL,
	groupId TEXT,
	position INTEGER NOT NULL,
	hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),
	createdAt TEXT NOT NULL,
	PRIMARY KEY (userId, itemKey),
	FOREIGN KEY (groupId) REFERENCES dashboard_group(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_dashboard_item_group ON dashboard_item (groupId);

CREATE TABLE IF NOT EXISTS discovery_identity (
	userId TEXT NOT NULL,
	slug TEXT NOT NULL,
	name TEXT NOT NULL,
	-- JSON array of strings. Matching (never ownership) is done in the client.
	aliases TEXT NOT NULL DEFAULT '[]',
	removed INTEGER NOT NULL DEFAULT 0 CHECK (removed IN (0, 1)),
	updatedAt TEXT NOT NULL,
	PRIMARY KEY (userId, slug)
);
