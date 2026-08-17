-- Spec 007: the Cloudflare account, connected with OAuth instead of a token
-- pasted into a secret store.
--
-- One row, always `id = 'default'`. The Cloud section is platform-wide and
-- admin-only — it reads the owner's whole account — so there is exactly one
-- connection to hold, the same way there was exactly one CLOUDFLARE_API_TOKEN.
-- A per-user table would suggest a per-user view that does not exist.
--
-- accessToken and refreshToken are sealed with SECRET_ENCRYPTION_KEY (see
-- ../../lib/secret-box.ts), so a dump of this table alone hands over nothing
-- usable. They live here rather than in a Worker secret because a secret cannot
-- be rewritten from inside a request, and a refresh token that cannot be
-- persisted after rotation is a refresh token that works exactly once.
--
-- Apply with:
--   wrangler d1 migrations apply DB --local             (dev)
--   wrangler d1 migrations apply DB --env production --remote

CREATE TABLE IF NOT EXISTS cloudflare_connection (
	id TEXT PRIMARY KEY,
	accountId TEXT NOT NULL,
	accountName TEXT,
	-- Space-separated, exactly as the token endpoint granted it. Kept so the UI
	-- can show what was consented to, and so a scope added later is visibly
	-- missing rather than failing as an opaque 403 from Cloudflare.
	scope TEXT NOT NULL,
	accessToken TEXT NOT NULL,
	-- Null once a refresh has been refused for good: the row then reads as
	-- "connected, unrenewable" — which is what the UI turns into a reconnect
	-- prompt instead of silently falling back to a differently-scoped token.
	refreshToken TEXT,
	expiresAt TEXT NOT NULL,
	-- app_user.id of the administrator who consented. Not a foreign key: the
	-- connection belongs to the install, and must outlive that person's row.
	connectedBy TEXT NOT NULL,
	connectedAt TEXT NOT NULL,
	updatedAt TEXT NOT NULL
);
