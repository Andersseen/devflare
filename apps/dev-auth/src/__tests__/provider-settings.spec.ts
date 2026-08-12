import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import adminSettingsRoutes from '../routes/admin-settings';
import {
  getProviderSettings,
  maySignUp,
  resetProviderSettingsCache,
} from '../lib/provider-settings';
import { seal } from '../lib/secret-box';
import { createTestD1, MIGRATIONS, type TestD1 } from './helpers/d1';
import type { Env } from '../index';

/**
 * Provider settings, and the one asymmetry that makes them worth their own
 * spec: `SIGNUP_ALLOWLIST` empty means "no restriction", which is right as a
 * local-dev default and wrong as the failure mode of a database read.
 */

const ADMIN = 'owner@devflare.test';
const SERVICE_TOKEN = 'service-token-with-plenty-of-entropy-here';
const ENCRYPTION_KEY = 'zm9Vb0hQZ0hkT2xQbGtqaGdmZHNhcXdlcnR5dWlvcDA=';

let d1: TestD1;

function createEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: d1.binding,
    BETTER_AUTH_URL: 'https://auth.test',
    BETTER_AUTH_SECRET: 'test-secret-at-least-32-characters-long',
    ADMIN_EMAILS: ADMIN,
    ADMIN_API_TOKEN: SERVICE_TOKEN,
    SECRET_ENCRYPTION_KEY: ENCRYPTION_KEY,
    ...overrides,
  } as Env;
}

function createApp(env: Env) {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/admin/settings', adminSettingsRoutes);
  return (path: string, init: RequestInit = {}) =>
    app.request(`http://auth.test/admin/settings${path}`, init, env);
}

function asAdmin(init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_TOKEN}`,
      'x-devauth-actor': ADMIN,
      ...(init.headers as Record<string, string> | undefined),
    },
  };
}

function setRow(key: string, value: string | null, encrypted = false) {
  d1.sqlite
    .prepare(
      'INSERT INTO providerSetting (key, value, encrypted, updatedAt) VALUES (?, ?, ?, ?)',
    )
    .run(key, value, encrypted ? 1 : 0, Date.now());
}

beforeEach(() => {
  d1 = createTestD1(MIGRATIONS);
  resetProviderSettingsCache();
});

afterEach(() => {
  d1.close();
  resetProviderSettingsCache();
});

describe('resolution order', () => {
  it('falls back to the environment when there is no row', async () => {
    const settings = await getProviderSettings(
      createEnv({ GITHUB_CLIENT_ID: 'from-env', GITHUB_CLIENT_SECRET: 's' }),
    );

    expect(settings.github.clientId).toBe('from-env');
    expect(settings.github.enabled).toBe(true);
  });

  it('prefers a stored row over the environment', async () => {
    setRow('github.clientId', 'from-d1');

    const settings = await getProviderSettings(
      createEnv({ GITHUB_CLIENT_ID: 'from-env', GITHUB_CLIENT_SECRET: 's' }),
    );

    expect(settings.github.clientId).toBe('from-d1');
  });

  it('decrypts a stored secret', async () => {
    setRow(
      'github.clientSecret',
      await seal('sealed-secret', ENCRYPTION_KEY),
      true,
    );

    const settings = await getProviderSettings(
      createEnv({ GITHUB_CLIENT_ID: 'id' }),
    );

    expect(settings.github.clientSecret).toBe('sealed-secret');
  });

  it('does not fall back to the env var when a stored secret cannot be decrypted', async () => {
    // Otherwise a botched key rotation would look like it worked.
    setRow('github.clientSecret', await seal('sealed', ENCRYPTION_KEY), true);

    const settings = await getProviderSettings(
      createEnv({
        GITHUB_CLIENT_ID: 'id',
        GITHUB_CLIENT_SECRET: 'the-old-env-secret',
        SECRET_ENCRYPTION_KEY: 'a-different-key-entirely',
      }),
    );

    expect(settings.github.clientSecret).toBe('');
    expect(settings.github.enabled).toBe(false);
  });

  it('does not advertise a half-configured provider', async () => {
    const settings = await getProviderSettings(
      createEnv({ GITHUB_CLIENT_ID: 'id-only' }),
    );

    expect(settings.github.enabled).toBe(false);
  });

  it('can be switched off with both halves present', async () => {
    setRow('github.enabled', 'false');

    const settings = await getProviderSettings(
      createEnv({ GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 's' }),
    );

    expect(settings.github.enabled).toBe(false);
  });
});

describe('the signup allowlist fails closed', () => {
  it('keeps today’s meaning when nothing is configured anywhere', async () => {
    const settings = await getProviderSettings(createEnv());

    expect(settings.signupRestricted).toBe(false);
    expect(maySignUp('anyone@test.dev', settings)).toBe(true);
  });

  it('restricts to the env var when there is no row', async () => {
    const settings = await getProviderSettings(
      createEnv({ SIGNUP_ALLOWLIST: 'owner@test.dev' }),
    );

    expect(maySignUp('owner@test.dev', settings)).toBe(true);
    expect(maySignUp('someone@test.dev', settings)).toBe(false);
  });

  it('treats an empty row as "nobody", not as "unrestricted"', async () => {
    // The difference between "configured as empty" and "not configured" is the
    // whole point: a row is an explicit decision.
    setRow('signup.allowlist', '');

    const settings = await getProviderSettings(createEnv());

    expect(settings.signupRestricted).toBe(true);
    expect(maySignUp('anyone@test.dev', settings)).toBe(false);
  });

  it('denies sign-up when the database cannot be read', async () => {
    // The failure that matters: a broken read must not open sign-up to everyone.
    const settings = await getProviderSettings(
      createEnv({
        DB: undefined as unknown as D1Database,
        SIGNUP_ALLOWLIST: '',
      }),
    );

    expect(settings.signupRestricted).toBe(true);
    expect(maySignUp('anyone@test.dev', settings)).toBe(false);
  });
});

describe('settings admin API', () => {
  it('refuses a non-admin', async () => {
    const request = createApp(createEnv({ ADMIN_EMAILS: 'someone@else.dev' }));

    expect((await request('', asAdmin())).status).toBe(403);
  });

  it('never returns the GitHub secret', async () => {
    setRow(
      'github.clientSecret',
      await seal('very-secret', ENCRYPTION_KEY),
      true,
    );
    const request = createApp(createEnv({ GITHUB_CLIENT_ID: 'id' }));

    const raw = await (await request('', asAdmin())).text();

    expect(raw).not.toContain('very-secret');
    expect(JSON.parse(raw).github.secretConfigured).toBe(true);
  });

  it('stores the GitHub secret encrypted, not in the clear', async () => {
    const request = createApp(createEnv());

    const response = await request(
      '/github',
      asAdmin({
        method: 'PATCH',
        body: JSON.stringify({ clientId: 'gh-id', clientSecret: 'gh-secret' }),
      }),
    );

    expect(response.status).toBe(200);
    const row = d1.sqlite
      .prepare('SELECT value, encrypted FROM providerSetting WHERE key = ?')
      .get('github.clientSecret') as { value: string; encrypted: number };
    expect(row.encrypted).toBe(1);
    expect(row.value).not.toContain('gh-secret');
  });

  it('refuses to store a secret when no encryption key is set', async () => {
    // Storing it in the clear because a key is missing would silently downgrade
    // the guarantee the caller is relying on.
    const request = createApp(createEnv({ SECRET_ENCRYPTION_KEY: undefined }));

    const response = await request(
      '/github',
      asAdmin({
        method: 'PATCH',
        body: JSON.stringify({ clientSecret: 'gh-secret' }),
      }),
    );

    expect(response.status).toBe(503);
    expect(
      d1.sqlite.prepare('SELECT COUNT(*) as n FROM providerSetting').get(),
    ).toEqual({ n: 0 });
  });

  it('takes effect immediately, without waiting for the cache to expire', async () => {
    const env = createEnv();
    const request = createApp(env);
    await getProviderSettings(env);

    await request(
      '/github',
      asAdmin({
        method: 'PATCH',
        body: JSON.stringify({
          clientId: 'new-id',
          clientSecret: 'new-secret',
        }),
      }),
    );

    expect((await getProviderSettings(env)).github.clientId).toBe('new-id');
  });

  it('replaces the allowlist and reports when it locks everyone out', async () => {
    const request = createApp(createEnv());

    const response = await request(
      '/allowlist',
      asAdmin({ method: 'PUT', body: JSON.stringify({ allowlist: [] }) }),
    );

    expect(await response.json()).toMatchObject({
      allowlist: [],
      restricted: true,
      closedToNewSignups: true,
    });
  });

  it('normalises and rejects things that are not addresses', async () => {
    const request = createApp(createEnv());

    expect(
      (
        await request(
          '/allowlist',
          asAdmin({
            method: 'PUT',
            body: JSON.stringify({ allowlist: ['not-an-address'] }),
          }),
        )
      ).status,
    ).toBe(400);

    const ok = await request(
      '/allowlist',
      asAdmin({
        method: 'PUT',
        body: JSON.stringify({ allowlist: ['  Owner@Test.Dev  '] }),
      }),
    );
    expect(await ok.json()).toMatchObject({ allowlist: ['owner@test.dev'] });
  });

  it('audits a settings change against the acting human', async () => {
    const request = createApp(createEnv());

    await request(
      '/allowlist',
      asAdmin({
        method: 'PUT',
        body: JSON.stringify({ allowlist: ['owner@test.dev'] }),
      }),
    );

    const row = d1.sqlite
      .prepare('SELECT actorEmail, action, clientId FROM oauthClientAudit')
      .get();

    expect(row).toMatchObject({
      actorEmail: ADMIN,
      action: 'settings.allowlist',
      clientId: null,
    });
  });
});
