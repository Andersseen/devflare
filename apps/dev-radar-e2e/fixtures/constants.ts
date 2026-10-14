/**
 * Shared by the seed script and the specs. These are values for a throwaway
 * LOCAL database and a local dev server only — never real credentials.
 */
export const OWNER_SESSION_TOKEN =
  'e2e-owner-session-token-0000000000000000000';
export const BLOCKED_SESSION_TOKEN =
  'e2e-blocked-session-token-000000000000000000';
export const WEBHOOK_SECRET = 'e2e-webhook-secret';
export const SESSION_COOKIE = 'dr_session';

/** A local stand-in for api.github.com (fixtures/fake-github-server.mjs). */
export const FAKE_GITHUB_PORT = 4410;
