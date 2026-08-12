-- Provider configuration that can be changed without a deploy.
--
-- Spec 003. Until now the GitHub OAuth App credentials and the signup allowlist
-- existed only as wrangler.toml vars, so enabling GitHub sign-in or letting a
-- second person in meant editing TOML and redeploying.
--
-- Additive, and deliberately seeds NOTHING. Resolution is D1 row -> config var
-- -> built-in default (see src/lib/provider-settings.ts), so an empty table
-- means every value keeps coming from exactly where it comes from today. That
-- makes this migration a no-op behaviourally, and makes migrating each value a
-- separate, reversible decision rather than a flag day.
--
-- One exception is documented in the spec and NOT done here: production should
-- end up with an explicit `signup.allowlist` row, because a missing row falls
-- back to the var whose empty value means "unrestricted". Writing that row is an
-- operator action through /admin/settings, not a migration, so that it is
-- audited and attributable like every other change to who may sign in.

CREATE TABLE IF NOT EXISTS providerSetting (
  key TEXT PRIMARY KEY,
  -- Plaintext for ordinary values; ciphertext when `encrypted` is 1.
  value TEXT,
  -- Marks values sealed with AES-GCM under SECRET_ENCRYPTION_KEY. Only the
  -- GitHub client secret needs it: it is the one credential this service must
  -- present to a third party, so it cannot be stored as a hash.
  encrypted INTEGER NOT NULL DEFAULT 0,
  updatedAt INTEGER NOT NULL,
  -- Email of the admin who last wrote it. The full history is in
  -- oauthClientAudit, which carries settings changes with a null clientId.
  updatedBy TEXT
);
