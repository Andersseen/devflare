-- Ban columns for the Users admin panel, and a generalised audit table.
--
-- Spec 011. Ban is a binary switch, not the admin plugin's role/banExpires
-- model (see the spec's investigation notes) — three nullable columns are
-- enough: whether a user is banned, why, and who did it. `bannedAt` is the
-- switch itself (null = active); the other two are display-only.
--
-- oauthClientAudit (migration 0004) already has the shape a general admin
-- audit table needs — actor, action, target, changes, createdAt — so this
-- migration widens it with one column instead of creating a parallel table.
-- Existing rows are every action taken before this migration, all of them
-- either a client action or a settings action; both are backfilled from
-- `action` rather than left null, so historical rows stay queryable the same
-- way new ones will be.
--
-- Purely additive: two ALTER TABLE ADD COLUMN pairs and one backfill UPDATE.
-- No column is dropped or renamed, no existing row's clientId/actorEmail/etc
-- changes.

ALTER TABLE user ADD COLUMN bannedAt INTEGER;
ALTER TABLE user ADD COLUMN bannedReason TEXT;
ALTER TABLE user ADD COLUMN bannedBy TEXT;

ALTER TABLE oauthClientAudit ADD COLUMN targetType TEXT NOT NULL DEFAULT 'client';

UPDATE oauthClientAudit SET targetType = 'settings' WHERE action LIKE 'settings.%';
