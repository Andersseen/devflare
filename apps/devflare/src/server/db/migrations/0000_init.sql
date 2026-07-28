-- DevFlare app schema for D1 (SQLite).
-- Ported from the former initDatabase() DDL in ../index.ts, which ran against a
-- local better-sqlite3 file before the move to Cloudflare.
--
-- Apply with:
--   wrangler d1 migrations apply devflare-db --local     (dev)
--   wrangler d1 migrations apply devflare-db --remote    (production)

CREATE TABLE IF NOT EXISTS projects (
	id TEXT PRIMARY KEY,
	userId TEXT NOT NULL,
	name TEXT NOT NULL,
	repoUrl TEXT,
	createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deployments (
	id TEXT PRIMARY KEY,
	projectId TEXT NOT NULL,
	status TEXT NOT NULL,
	commitSha TEXT,
	previewUrl TEXT,
	createdAt TEXT NOT NULL,
	FOREIGN KEY (projectId) REFERENCES projects(id)
);

-- The projects list is always scoped to the session user and sorted by date.
CREATE INDEX IF NOT EXISTS idx_projects_userId_createdAt
	ON projects (userId, createdAt DESC);

CREATE INDEX IF NOT EXISTS idx_deployments_projectId
	ON deployments (projectId);
