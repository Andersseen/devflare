-- Spec 019: a project owns many Cloudflare resources.
--
-- 0002 gave a project exactly one link (`cfType` + `cfName`, Worker or Pages).
-- A real project is several Workers, a Pages project, a database, a bucket…
-- so the link moves into its own table, one row per owned resource, and the
-- two columns go away. One source of truth, not two.
--
-- What is stored is ownership only — which resource, by its stable Cloudflare
-- identifier, belongs to which project. Everything about the resource's current
-- state (domains, versions, deployments, size) is still read from Cloudflare.
--
--   type     resourceId (stable key)      resourceName (label at link time)
--   worker   script name                  script name
--   pages    Pages project name           Pages project name
--   d1       database uuid                database name
--   kv       namespace id                 namespace title
--   r2       bucket name                  bucket name
--
-- Ownership is exclusive: the unique index means one Cloudflare resource
-- belongs to at most one DevFlare project. A Worker listed under two projects
-- would make every later question about it ("is Ally healthy?") ambiguous.
--
-- Deleting a project deletes its links (ON DELETE CASCADE; D1 enforces foreign
-- keys). It never touches the resource on Cloudflare.
--
-- Legacy links are copied across before the columns are dropped. The copy is
-- a plain INSERT on purpose: if two old projects both named the same resource,
-- the unique index fails this migration — and D1 rolls the whole file back —
-- rather than silently keeping one owner. Preflight query and recovery steps:
-- docs/specs/019-project-resources.md.
--
-- Apply with:
--   wrangler d1 migrations apply DB --local             (dev)
--   wrangler d1 migrations apply DB --env production --remote

CREATE TABLE IF NOT EXISTS project_resource (
	id TEXT PRIMARY KEY,
	projectId TEXT NOT NULL,
	-- Only Cloudflare today. Kept as a column so a row says what it points at
	-- without the reader having to know that.
	provider TEXT NOT NULL DEFAULT 'cloudflare' CHECK (provider IN ('cloudflare')),
	type TEXT NOT NULL CHECK (type IN ('worker', 'pages', 'd1', 'r2', 'kv')),
	resourceId TEXT NOT NULL CHECK (length(trim(resourceId)) > 0),
	resourceName TEXT NOT NULL,
	createdAt TEXT NOT NULL,
	FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
);

-- Exclusive ownership, and no duplicate link within one project either.
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_resource_identity
	ON project_resource (provider, type, resourceId);

-- Every read is "the resources of these projects".
CREATE INDEX IF NOT EXISTS idx_project_resource_projectId
	ON project_resource (projectId);

INSERT INTO project_resource (id, projectId, provider, type, resourceId, resourceName, createdAt)
SELECT
	lower(hex(randomblob(16))),
	id,
	'cloudflare',
	cfType,
	trim(cfName),
	trim(cfName),
	createdAt
FROM projects
WHERE cfType IN ('worker', 'pages')
	AND cfName IS NOT NULL
	AND trim(cfName) <> '';

ALTER TABLE projects DROP COLUMN cfType;
ALTER TABLE projects DROP COLUMN cfName;
