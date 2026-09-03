import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../index';
import { resetClientRegistryCache } from '../auth.config';
import { resetProviderSettingsCache } from '../lib/provider-settings';
import { createTestD1, MIGRATIONS, type TestD1 } from './helpers/d1';
import type { Env } from '../index';

/**
 * The ban check in ../auth.config.ts's `session.create.before` hook, run
 * against the real Hono app and a real D1-backed drizzle adapter — not the
 * `memoryAdapter` ../oauth-provider.spec.ts otherwise uses for speed.
 *
 * That distinction matters here specifically: the hook resolves the user
 * through `ctx.context.internalAdapter`, which better-auth's own in-memory
 * test adapter does not carry unregistered schema columns (`bannedAt`)
 * through, while the real drizzle adapter — the one this Worker actually
 * runs on — does. Testing this one behaviour against the memory adapter would
 * pass or fail for a reason that says nothing about production.
 */

let d1: TestD1;

function createEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: d1.binding,
    BETTER_AUTH_URL: 'https://auth.test',
    BETTER_AUTH_SECRET: 'test-secret-at-least-32-characters-long',
    ...overrides,
  } as Env;
}

function request(
  path: string,
  env: Env,
  init?: RequestInit,
): Promise<Response> {
  return Promise.resolve(
    app.fetch(new Request(`https://auth.test${path}`, init), env),
  );
}

async function signUp(env: Env, email: string) {
  const response = await request('/api/auth/sign-up/email', env, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'TestPass123', name: 'Test User' }),
  });
  expect(response.status).toBe(200);
  const raw = response.headers.getSetCookie?.() ?? [];
  return raw.map((cookie) => cookie.split(';')[0]).join('; ');
}

function signIn(env: Env, email: string): Promise<Response> {
  return request('/api/auth/sign-in/email', env, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'TestPass123' }),
  });
}

function setBanned(email: string, banned: boolean): void {
  d1.sqlite
    .prepare('UPDATE user SET bannedAt = ? WHERE email = ?')
    .run(banned ? Date.now() : null, email);
}

beforeEach(() => {
  d1 = createTestD1(MIGRATIONS);
  resetClientRegistryCache();
  resetProviderSettingsCache();
});

afterEach(() => d1.close());

describe('a banned user', () => {
  it('cannot start a new session, but keeps an existing one', async () => {
    const env = createEnv();
    const email = 'banned@devflare.test';
    const cookie = await signUp(env, email);

    setBanned(email, true);

    // The session created before the ban keeps working — banning is a
    // different action from revoking sessions (../routes/admin-sessions.ts).
    const existing = await request('/api/auth/get-session', env, {
      headers: { cookie },
    });
    expect(existing.status).toBe(200);
    expect((await existing.json()) as { user?: { email: string } }).toEqual(
      expect.objectContaining({ user: expect.objectContaining({ email }) }),
    );

    const refused = await signIn(env, email);
    expect(refused.status).toBe(403);
  });

  it('can sign in again once unbanned', async () => {
    const env = createEnv();
    const email = 'unbanned@devflare.test';
    await signUp(env, email);

    setBanned(email, true);
    expect((await signIn(env, email)).status).toBe(403);

    setBanned(email, false);
    expect((await signIn(env, email)).status).toBe(200);
  });
});
