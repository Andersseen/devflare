-- DevTools' own database (spec 020). Connected-tool state only:
--   DevAuth DB   -> identity
--   DevFlare DB  -> projects / infrastructure metadata
--   DevTools DB  -> this: DevTools' session + short links
--
-- Apply with:
--   pnpm cf:tools d1 migrations apply DB --local
--   pnpm cf:tools d1 migrations apply DB --env production --remote

-- A local copy of the identity DevAuth returned at sign-in, so pages can show
-- who is signed in without calling the provider. `id` is DevAuth's `sub`.
CREATE TABLE IF NOT EXISTS app_user (
	id TEXT PRIMARY KEY,
	email TEXT NOT NULL,
	name TEXT NOT NULL,
	image TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_session (
	-- SHA-256 of the dt_session cookie, never the value: a leaked read of this
	-- table must not hand over working sessions.
	token_hash TEXT PRIMARY KEY,
	user_id TEXT NOT NULL,
	expires_at TEXT NOT NULL,
	created_at TEXT NOT NULL,
	FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_app_session_user_id ON app_session (user_id);
CREATE INDEX IF NOT EXISTS idx_app_session_expires_at ON app_session (expires_at);

-- Personal short links. Slugs share one public namespace (the short-link
-- host), so they are unique across owners, not per owner. No click/analytics
-- table on purpose.
CREATE TABLE IF NOT EXISTS short_link (
	id TEXT PRIMARY KEY,
	-- DevAuth `sub` of whoever created it. Not a foreign key to app_user: a
	-- link outlives the session copy of its owner's profile.
	owner_user_id TEXT NOT NULL,
	slug TEXT NOT NULL UNIQUE,
	destination TEXT NOT NULL,
	active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_short_link_owner ON short_link (owner_user_id, created_at);
