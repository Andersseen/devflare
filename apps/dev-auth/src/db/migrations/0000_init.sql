-- Better Auth core schema for D1 (SQLite)
-- Run with: wrangler d1 migrations apply dev-auth-db --local

CREATE TABLE IF NOT EXISTS "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"emailVerified" integer DEFAULT false NOT NULL,
	"image" text,
	"createdAt" integer DEFAULT (unixepoch()) NOT NULL,
	"updatedAt" integer DEFAULT (unixepoch()) NOT NULL
);

CREATE TABLE IF NOT EXISTS "session" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"token" text NOT NULL UNIQUE,
	"expiresAt" integer NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"createdAt" integer DEFAULT (unixepoch()) NOT NULL,
	"updatedAt" integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"accessTokenExpiresAt" integer,
	"refreshTokenExpiresAt" integer,
	"scope" text,
	"idToken" text,
	"password" text,
	"createdAt" integer DEFAULT (unixepoch()) NOT NULL,
	"updatedAt" integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" integer NOT NULL,
	"createdAt" integer DEFAULT (unixepoch()) NOT NULL,
	"updatedAt" integer DEFAULT (unixepoch()) NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session" ("userId");
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account" ("userId");
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" ("identifier");
