-- DevFlare's own identity tables.
--
-- Added when dev-auth became an OAuth 2.1 / OIDC provider. DevFlare used to have
-- no session of its own: it forwarded the browser's dev-auth cookie to
-- /api/auth/get-session on every request, which only worked because both live on
-- subdomains of andersseen.dev. That does not generalise to apps on unrelated
-- domains, so DevFlare now completes the authorization code flow and keeps its
-- own session instead.
--
-- app_user.id is the dev-auth user id (the `sub` claim), so the userId already
-- stored on `projects` rows keeps pointing at the same person.
--
-- Apply with:
--   wrangler d1 migrations apply DB --local             (dev)
--   wrangler d1 migrations apply DB --env production --remote

CREATE TABLE IF NOT EXISTS app_user (
	id TEXT PRIMARY KEY,
	email TEXT NOT NULL,
	name TEXT NOT NULL,
	image TEXT,
	createdAt TEXT NOT NULL,
	updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_session (
	-- Hash of the cookie value, never the value itself: a leaked read of this
	-- table must not hand over usable sessions.
	tokenHash TEXT PRIMARY KEY,
	userId TEXT NOT NULL,
	expiresAt TEXT NOT NULL,
	createdAt TEXT NOT NULL,
	FOREIGN KEY (userId) REFERENCES app_user(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_app_session_userId ON app_session (userId);
-- Expired-row cleanup scans by date.
CREATE INDEX IF NOT EXISTS idx_app_session_expiresAt ON app_session (expiresAt);
