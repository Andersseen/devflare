-- Audit trail for OAuth client administration.
--
-- Spec 002. Until now an app could only be registered by editing OAUTH_CLIENTS
-- and deploying, so git history *was* the audit trail. Clients can now also be
-- created and edited at runtime through /admin/clients, and this table is what
-- keeps that answerable: who changed which client, when, and to what.
--
-- Purely additive. It creates one new table and touches nothing that exists —
-- no user, session, account, token or oauthClient row is read or written by
-- this migration, so replaying it on a populated database changes no behaviour.

CREATE TABLE IF NOT EXISTS oauthClientAudit (
  id TEXT PRIMARY KEY,
  -- Null when the acting account has since been deleted. The email below is
  -- what actually identifies the actor.
  actorUserId TEXT,
  -- Denormalised on purpose: it must keep recording who acted even after that
  -- account is renamed or removed. No foreign key, for the same reason.
  actorEmail TEXT NOT NULL,
  -- create | update | delete | rotate-secret
  action TEXT NOT NULL,
  -- Plain text, no foreign key: a `delete` entry names a row that is gone, and
  -- a configured client never had a row here at all.
  clientId TEXT,
  -- JSON of the changed fields, before and after. Never holds a client secret;
  -- a rotation records that it happened, not what the value became.
  changes TEXT,
  createdAt INTEGER NOT NULL
);

-- The two questions this table gets asked: "what happened to this client" and
-- "what happened recently".
CREATE INDEX IF NOT EXISTS idx_oauthClientAudit_clientId
  ON oauthClientAudit(clientId);
CREATE INDEX IF NOT EXISTS idx_oauthClientAudit_createdAt
  ON oauthClientAudit(createdAt);
