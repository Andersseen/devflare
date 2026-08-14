-- Spec 005: point a DevFlare project row at the thing it actually deploys to.
--
-- Additive on purpose. Existing rows keep both columns null and behave exactly
-- as before — an unlinked project is an ordinary state, not a broken one.
--
-- `cfType` is 'worker' or 'pages'; `cfName` is the script id or the Pages
-- project name. No foreign key and no copy of the resource: Cloudflare stays
-- the source of truth and a resource deleted there simply stops resolving.
--
-- Apply with:
--   wrangler d1 migrations apply devflare-db --local     (dev)
--   wrangler d1 migrations apply devflare-db --remote    (production)

ALTER TABLE projects ADD COLUMN cfType TEXT;
ALTER TABLE projects ADD COLUMN cfName TEXT;
