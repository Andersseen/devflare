-- Migrates the provider tables from better-auth's `oidc-provider` plugin to its
-- successor, `@better-auth/oauth-provider`.
--
-- The old plugin is deprecated upstream ("will be removed in the next major
-- version"). Its replacement uses a different set of tables: clients moved from
-- `oauthApplication` to `oauthClient`, refresh tokens moved out of
-- `oauthAccessToken` into their own `oauthRefreshToken`, and both token tables
-- and `oauthConsent` changed columns.
--
-- Non-destructive by construction:
--
--   * `user`, `session`, `account`, `verification` and `jwks` are NOT touched.
--     Every existing account, password, linked GitHub identity, live session and
--     signing key survives this migration untouched. Users do not have to do
--     anything.
--   * The three old provider tables are renamed, not dropped, so nothing is
--     deleted here and the change can be reversed by renaming them back. They
--     become legacy the moment this runs: the new plugin never reads them.
--
-- What the rename does cost: access and refresh tokens issued by the old plugin
-- stop being redeemable, because the new plugin looks for them in the new tables
-- in a different (hashed) format. That is unavoidable in either direction — the
-- two plugins cannot read each other's tokens. Consumers recover by running the
-- authorization flow again, which for a browser session means one redirect.
-- Authorization codes live ten minutes, so at most one in-flight login is lost.
--
-- Once the legacy tables are confirmed empty (or their contents no longer
-- wanted), they can be dropped in a later migration:
--
--   DROP TABLE "oauthApplication_legacy_oidc";
--   DROP TABLE "oauthAccessToken_legacy_oidc";
--   DROP TABLE "oauthConsent_legacy_oidc";
--
-- Deliberately not done in the same migration as the rename: dropping is the one
-- irreversible step here, and it should be a separate, deliberate decision taken
-- after looking at the rows.
--
-- Apply with:
--   wrangler d1 migrations apply DB --local              (dev)
--   wrangler d1 migrations apply DB --env production --remote

-- 1. Retire the old provider tables. The rename frees the `oauthAccessToken`
--    and `oauthConsent` names, which the new plugin reuses with different
--    columns — creating the new ones alongside is not possible.
ALTER TABLE "oauthApplication" RENAME TO "oauthApplication_legacy_oidc";
ALTER TABLE "oauthAccessToken" RENAME TO "oauthAccessToken_legacy_oidc";
ALTER TABLE "oauthConsent" RENAME TO "oauthConsent_legacy_oidc";

-- An index follows its table through a rename but KEEPS ITS OWN NAME, so the
-- indexes created in 0002 still occupy the names this migration wants to reuse
-- below. Without dropping them first, `CREATE INDEX IF NOT EXISTS` would find
-- the name taken, skip silently, and leave the new tables unindexed — a
-- migration that appears to succeed and quietly costs a full scan per lookup.
-- The legacy tables are never read again, so they do not need indexes.
DROP INDEX IF EXISTS "oauthAccessToken_clientId_idx";
DROP INDEX IF EXISTS "oauthAccessToken_userId_idx";
DROP INDEX IF EXISTS "oauthConsent_clientId_userId_idx";

-- 2. Registered clients.
--
-- This table stays EMPTY. Clients are registered in configuration
-- (`OAUTH_CLIENTS` + `OAUTH_CLIENT_SECRETS`) and served to the provider from
-- there — see src/client-registry.ts — so no client secret is ever written to
-- D1, and removing an app from the config removes it from the provider with no
-- stale row left behind that could still complete an authorization.
--
-- It exists so that a lookup for an unrecognised client id returns "no such
-- client" rather than a SQL error, and so the schema matches what the plugin
-- expects if the registry is ever moved into the database.
CREATE TABLE IF NOT EXISTS "oauthClient" (
	"id" text PRIMARY KEY NOT NULL,
	"clientId" text NOT NULL UNIQUE,
	"clientSecret" text,
	"disabled" integer DEFAULT false,
	"skipConsent" integer,
	"enableEndSession" integer,
	"subjectType" text,
	"scopes" text,
	"userId" text,
	"createdAt" integer DEFAULT (unixepoch()) NOT NULL,
	"updatedAt" integer DEFAULT (unixepoch()) NOT NULL,
	"name" text,
	"uri" text,
	"icon" text,
	"contacts" text,
	"tos" text,
	"policy" text,
	"softwareId" text,
	"softwareVersion" text,
	"softwareStatement" text,
	"redirectUris" text NOT NULL,
	"postLogoutRedirectUris" text,
	"tokenEndpointAuthMethod" text,
	"grantTypes" text,
	"responseTypes" text,
	"public" integer,
	"type" text,
	"requirePKCE" integer,
	"referenceId" text,
	"metadata" text,
	FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
);

-- 3. Refresh tokens, issued when a client asks for the `offline_access` scope.
--    New table: the old plugin kept the refresh token in a column on the access
--    token row, which made independent revocation impossible.
--
--    No foreign key to "oauthClient". Registered clients live in configuration,
--    not in that table, so a constraint here would reject every token this
--    provider issues. `clientId` is a plain indexed column instead.
CREATE TABLE IF NOT EXISTS "oauthRefreshToken" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL UNIQUE,
	"clientId" text NOT NULL,
	"sessionId" text,
	"userId" text NOT NULL,
	"referenceId" text,
	"expiresAt" integer NOT NULL,
	"createdAt" integer DEFAULT (unixepoch()) NOT NULL,
	"revoked" integer,
	"authTime" integer,
	"scopes" text NOT NULL,
	FOREIGN KEY ("sessionId") REFERENCES "session"("id") ON DELETE SET NULL,
	FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
);

-- 4. Opaque access tokens. Only written when a token cannot be a JWT (no
--    audience to sign for); the common case for a consumer app is a signed JWT
--    that never touches this table.
CREATE TABLE IF NOT EXISTS "oauthAccessToken" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL UNIQUE,
	"clientId" text NOT NULL,
	"sessionId" text,
	"userId" text,
	"referenceId" text,
	"refreshId" text,
	"expiresAt" integer NOT NULL,
	"createdAt" integer DEFAULT (unixepoch()) NOT NULL,
	"scopes" text NOT NULL,
	FOREIGN KEY ("sessionId") REFERENCES "session"("id") ON DELETE SET NULL,
	FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE,
	FOREIGN KEY ("refreshId") REFERENCES "oauthRefreshToken"("id") ON DELETE CASCADE
);

-- 5. Per-user, per-client consent. Every client registered today skips consent
--    (they are all first-party), but the provider reads this table on the way
--    past, so it has to exist.
CREATE TABLE IF NOT EXISTS "oauthConsent" (
	"id" text PRIMARY KEY NOT NULL,
	"clientId" text NOT NULL,
	"userId" text,
	"referenceId" text,
	"scopes" text NOT NULL,
	"createdAt" integer DEFAULT (unixepoch()) NOT NULL,
	"updatedAt" integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "oauthRefreshToken_clientId_idx"
	ON "oauthRefreshToken" ("clientId");
CREATE INDEX IF NOT EXISTS "oauthRefreshToken_sessionId_idx"
	ON "oauthRefreshToken" ("sessionId");
CREATE INDEX IF NOT EXISTS "oauthRefreshToken_userId_idx"
	ON "oauthRefreshToken" ("userId");
CREATE INDEX IF NOT EXISTS "oauthAccessToken_clientId_idx"
	ON "oauthAccessToken" ("clientId");
CREATE INDEX IF NOT EXISTS "oauthAccessToken_sessionId_idx"
	ON "oauthAccessToken" ("sessionId");
CREATE INDEX IF NOT EXISTS "oauthAccessToken_userId_idx"
	ON "oauthAccessToken" ("userId");
CREATE INDEX IF NOT EXISTS "oauthAccessToken_refreshId_idx"
	ON "oauthAccessToken" ("refreshId");
CREATE INDEX IF NOT EXISTS "oauthConsent_clientId_userId_idx"
	ON "oauthConsent" ("clientId", "userId");
CREATE INDEX IF NOT EXISTS "oauthClient_userId_idx"
	ON "oauthClient" ("userId");
