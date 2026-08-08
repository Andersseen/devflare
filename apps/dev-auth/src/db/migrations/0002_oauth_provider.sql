-- OAuth 2.1 / OIDC provider tables.
--
-- Created when dev-auth stopped being "the auth service for DevFlare" and became
-- an identity provider several independent apps authenticate against. Backs
-- better-auth's `oidc-provider` and `jwt` plugins; column names come from those
-- plugins and must not be renamed.
--
-- Additive only: the user/session/account/verification tables are untouched, so
-- existing accounts and sessions keep working.
--
-- Apply with:
--   wrangler d1 migrations apply DB --local              (dev)
--   wrangler d1 migrations apply DB --env production --remote

-- Clients registered in the database. The apps I run are registered through
-- configuration (OAUTH_CLIENTS) instead, so this normally stays empty — but the
-- provider queries it for any unrecognised client id.
CREATE TABLE IF NOT EXISTS "oauthApplication" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"metadata" text,
	"clientId" text NOT NULL UNIQUE,
	"clientSecret" text,
	"redirectUrls" text NOT NULL,
	"type" text NOT NULL,
	"disabled" integer DEFAULT false,
	"userId" text,
	"createdAt" integer DEFAULT (unixepoch()) NOT NULL,
	"updatedAt" integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
);

-- Tokens handed to a consumer app in exchange for an authorization code.
CREATE TABLE IF NOT EXISTS "oauthAccessToken" (
	"id" text PRIMARY KEY NOT NULL,
	"accessToken" text NOT NULL UNIQUE,
	"refreshToken" text NOT NULL UNIQUE,
	"accessTokenExpiresAt" integer,
	"refreshTokenExpiresAt" integer,
	"clientId" text NOT NULL,
	"userId" text,
	"scopes" text NOT NULL,
	"createdAt" integer DEFAULT (unixepoch()) NOT NULL,
	"updatedAt" integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
);

-- Per-user, per-client consent. Read on every authorization request.
CREATE TABLE IF NOT EXISTS "oauthConsent" (
	"id" text PRIMARY KEY NOT NULL,
	"clientId" text NOT NULL,
	"userId" text NOT NULL,
	"scopes" text NOT NULL,
	"consentGiven" integer NOT NULL,
	"createdAt" integer DEFAULT (unixepoch()) NOT NULL,
	"updatedAt" integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
);

-- ID token signing keys. Private halves are encrypted with BETTER_AUTH_SECRET.
CREATE TABLE IF NOT EXISTS "jwks" (
	"id" text PRIMARY KEY NOT NULL,
	"publicKey" text NOT NULL,
	"privateKey" text NOT NULL,
	"createdAt" integer NOT NULL,
	"expiresAt" integer
);

CREATE INDEX IF NOT EXISTS "oauthAccessToken_clientId_idx"
	ON "oauthAccessToken" ("clientId");
CREATE INDEX IF NOT EXISTS "oauthAccessToken_userId_idx"
	ON "oauthAccessToken" ("userId");
CREATE INDEX IF NOT EXISTS "oauthConsent_clientId_userId_idx"
	ON "oauthConsent" ("clientId", "userId");
