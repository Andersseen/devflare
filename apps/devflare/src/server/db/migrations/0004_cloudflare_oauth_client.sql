-- Spec 010: the OAuth client the Cloudflare connection is made with, stored
-- here instead of only in the environment.
--
-- Spec 007 read the client id and secret from CLOUDFLARE_OAUTH_CLIENT_ID /
-- CLOUDFLARE_OAUTH_CLIENT_SECRET. That works, but it means a deployment can
-- only be connected by someone with `wrangler secret put` — and on the live
-- site it stayed unconnected for exactly that reason. An administrator signed
-- into DevFlare can now enter the client from Settings and the environment
-- becomes the fallback, not the only source.
--
-- One row, always `id = 'default'`: there is one connection to make (see
-- 0003_cloudflare_connection.sql), so there is one client to make it with.
--
-- clientSecret is sealed with SECRET_ENCRYPTION_KEY (../../lib/secret-box.ts).
-- Without that key the settings API refuses to store one rather than writing it
-- in the clear — the same call dev-auth makes about the GitHub secret.
--
-- Apply with:
--   wrangler d1 migrations apply DB --local             (dev)
--   wrangler d1 migrations apply DB --env production --remote

CREATE TABLE IF NOT EXISTS cloudflare_oauth_client (
	id TEXT PRIMARY KEY,
	-- Not a credential: it travels in the authorization URL. Stored plainly so
	-- the UI can show which client a deployment is using.
	clientId TEXT NOT NULL,
	clientSecret TEXT NOT NULL,
	-- app_user.id of the administrator who entered it. Not a foreign key, for
	-- the same reason as cloudflare_connection.connectedBy.
	updatedBy TEXT NOT NULL,
	updatedAt TEXT NOT NULL
);
