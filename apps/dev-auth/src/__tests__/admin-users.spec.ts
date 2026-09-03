import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import adminUserRoutes from '../routes/admin-users';
import { createTestD1, MIGRATIONS, type TestD1 } from './helpers/d1';
import type { Env } from '../index';

/**
 * The Users admin API: listing, detail, ban, unban. Mirrors
 * admin-clients.spec.ts's authorization matrix rather than re-deriving it —
 * both routers share the same `authenticateAdmin`/CSRF middleware.
 */

const ADMIN = 'owner@devflare.test';
const SERVICE_TOKEN = 'service-token-with-plenty-of-entropy-here';

let d1: TestD1;

function createEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: d1.binding,
    BETTER_AUTH_URL: 'https://auth.test',
    BETTER_AUTH_SECRET: 'test-secret-at-least-32-characters-long',
    ADMIN_EMAILS: ADMIN,
    ADMIN_API_TOKEN: SERVICE_TOKEN,
    ...overrides,
  } as Env;
}

function createApp(env: Env) {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/admin/users', adminUserRoutes);
  return (path: string, init: RequestInit = {}) =>
    app.request(`http://auth.test/admin/users${path}`, init, env);
}

function asAdmin(init: RequestInit = {}, actor = ADMIN): RequestInit {
  return {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_TOKEN}`,
      'x-devauth-actor': actor,
      ...(init.headers as Record<string, string> | undefined),
    },
  };
}

function seedUser(
  id: string,
  email: string,
  overrides: Partial<{ name: string; password: boolean; github: boolean }> = {},
) {
  const now = Date.now();
  d1.sqlite
    .prepare(
      `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
       VALUES (?, ?, ?, 0, ?, ?)`,
    )
    .run(id, overrides.name ?? 'Test User', email, now, now);

  if (overrides.password !== false) {
    d1.sqlite
      .prepare(
        `INSERT INTO account (id, userId, accountId, providerId, password, createdAt, updatedAt)
         VALUES (?, ?, ?, 'credential', 'hashed', ?, ?)`,
      )
      .run(`${id}-pw`, id, email, now, now);
  }
  if (overrides.github) {
    d1.sqlite
      .prepare(
        `INSERT INTO account (id, userId, accountId, providerId, createdAt, updatedAt)
         VALUES (?, ?, ?, 'github', ?, ?)`,
      )
      .run(`${id}-gh`, id, `gh-${id}`, now, now);
  }
}

function seedSession(id: string, userId: string) {
  const now = Date.now();
  d1.sqlite
    .prepare(
      `INSERT INTO session (id, userId, token, expiresAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, userId, `token-${id}`, now + 86_400_000, now, now);
}

beforeEach(() => {
  d1 = createTestD1(MIGRATIONS);
});

afterEach(() => d1.close());

describe('admin users API — who may call it', () => {
  it('refuses an anonymous request', async () => {
    const request = createApp(createEnv());
    expect((await request('')).status).toBe(401);
  });

  it('refuses a signed-in non-admin', async () => {
    const request = createApp(createEnv());
    const response = await request('', asAdmin({}, 'someone-else@test.dev'));
    expect(response.status).toBe(403);
  });

  it('admits the configured admin', async () => {
    const request = createApp(createEnv());
    expect((await request('', asAdmin())).status).toBe(200);
  });

  it('denies everyone when ADMIN_EMAILS is unset', async () => {
    const request = createApp(createEnv({ ADMIN_EMAILS: undefined }));
    expect((await request('', asAdmin())).status).toBe(403);
  });
});

describe('admin users API — listing and detail', () => {
  it('lists users with their linked providers and session count', async () => {
    seedUser('u1', 'andrii@devflare.test', { github: true });
    seedSession('s1', 'u1');
    seedSession('s2', 'u1');

    const request = createApp(createEnv());
    const body = (await (await request('', asAdmin())).json()) as {
      users: { id: string; providers: string[]; sessionCount: number }[];
    };

    expect(body.users).toHaveLength(1);
    expect(body.users[0]).toMatchObject({
      id: 'u1',
      sessionCount: 2,
    });
    expect(body.users[0].providers.sort()).toEqual(['credential', 'github']);
  });

  it('filters by email/name substring', async () => {
    seedUser('u1', 'andrii@devflare.test');
    seedUser('u2', 'someone@else.test', { name: 'Someone Else' });

    const request = createApp(createEnv());
    const body = (await (await request('?q=andrii', asAdmin())).json()) as {
      users: { id: string }[];
    };

    expect(body.users.map((u) => u.id)).toEqual(['u1']);
  });

  it('404s on a user that does not exist', async () => {
    const request = createApp(createEnv());
    expect((await request('/ghost', asAdmin())).status).toBe(404);
  });

  it('never includes a password hash or OAuth token', async () => {
    seedUser('u1', 'andrii@devflare.test', { github: true });
    const request = createApp(createEnv());
    const raw = await (await request('', asAdmin())).text();

    expect(raw).not.toMatch(/hashed/);
    expect(raw).not.toMatch(/accessToken/);
    expect(raw).not.toMatch(/refreshToken/);
  });
});

describe('admin users API — ban / unban', () => {
  it('bans a user and records who and why', async () => {
    seedUser('u1', 'andrii@devflare.test');
    const request = createApp(createEnv());

    const response = await request(
      '/u1/ban',
      asAdmin({ method: 'POST', body: JSON.stringify({ reason: 'abuse' }) }),
    );
    expect(response.status).toBe(200);

    const stored = d1.sqlite
      .prepare('SELECT bannedAt, bannedReason, bannedBy FROM user WHERE id = ?')
      .get('u1') as {
      bannedAt: number | null;
      bannedReason: string | null;
      bannedBy: string | null;
    };
    expect(stored.bannedAt).not.toBeNull();
    expect(stored.bannedReason).toBe('abuse');
    expect(stored.bannedBy).toBe(ADMIN);
  });

  it('reflects the ban in the next detail read', async () => {
    seedUser('u1', 'andrii@devflare.test');
    const request = createApp(createEnv());
    await request('/u1/ban', asAdmin({ method: 'POST' }));

    const body = (await (await request('/u1', asAdmin())).json()) as {
      banned: boolean;
    };
    expect(body.banned).toBe(true);
  });

  it('unban clears the ban', async () => {
    seedUser('u1', 'andrii@devflare.test');
    const request = createApp(createEnv());
    await request('/u1/ban', asAdmin({ method: 'POST' }));

    const response = await request('/u1/unban', asAdmin({ method: 'POST' }));
    expect(response.status).toBe(200);

    const stored = d1.sqlite
      .prepare('SELECT bannedAt, bannedReason, bannedBy FROM user WHERE id = ?')
      .get('u1') as {
      bannedAt: number | null;
      bannedReason: string | null;
      bannedBy: string | null;
    };
    expect(stored).toEqual({
      bannedAt: null,
      bannedReason: null,
      bannedBy: null,
    });
  });

  it('404s banning a user that does not exist', async () => {
    const request = createApp(createEnv());
    const response = await request('/ghost/ban', asAdmin({ method: 'POST' }));
    expect(response.status).toBe(404);
  });

  it('writes an audit row for ban and unban', async () => {
    seedUser('u1', 'andrii@devflare.test');
    const request = createApp(createEnv());
    await request('/u1/ban', asAdmin({ method: 'POST' }));
    await request('/u1/unban', asAdmin({ method: 'POST' }));

    const rows = d1.sqlite
      .prepare(
        'SELECT action, targetType, clientId FROM oauthClientAudit ORDER BY rowid',
      )
      .all() as { action: string; targetType: string; clientId: string }[];

    expect(rows).toEqual([
      { action: 'ban', targetType: 'user', clientId: 'u1' },
      { action: 'unban', targetType: 'user', clientId: 'u1' },
    ]);
  });
});
