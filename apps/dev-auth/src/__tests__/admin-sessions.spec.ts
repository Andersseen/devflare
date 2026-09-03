import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import adminSessionRoutes from '../routes/admin-sessions';
import { createTestD1, MIGRATIONS, type TestD1 } from './helpers/d1';
import type { Env } from '../index';

/**
 * The Sessions admin API: list, revoke one, revoke all for a user. Mirrors
 * admin-clients.spec.ts's authorization matrix — same shared middleware.
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
  app.route('/admin/sessions', adminSessionRoutes);
  return (path: string, init: RequestInit = {}) =>
    app.request(`http://auth.test/admin/sessions${path}`, init, env);
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

function seedUser(id: string, email: string) {
  const now = Date.now();
  d1.sqlite
    .prepare(
      `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
       VALUES (?, ?, ?, 0, ?, ?)`,
    )
    .run(id, 'Test User', email, now, now);
}

function seedSession(
  id: string,
  userId: string,
  overrides: Partial<{ ipAddress: string; userAgent: string }> = {},
) {
  const now = Date.now();
  d1.sqlite
    .prepare(
      `INSERT INTO session (id, userId, token, expiresAt, ipAddress, userAgent, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      userId,
      `token-${id}`,
      now + 86_400_000,
      overrides.ipAddress ?? null,
      overrides.userAgent ?? null,
      now,
      now,
    );
}

beforeEach(() => {
  d1 = createTestD1(MIGRATIONS);
});

afterEach(() => d1.close());

describe('admin sessions API — who may call it', () => {
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
});

describe('admin sessions API — listing', () => {
  it('lists every session with the owning user attached', async () => {
    seedUser('u1', 'andrii@devflare.test');
    seedSession('s1', 'u1', { ipAddress: '203.0.113.5', userAgent: 'curl/8' });

    const request = createApp(createEnv());
    const body = (await (await request('', asAdmin())).json()) as {
      sessions: {
        id: string;
        userEmail: string;
        ipAddress: string | null;
        userAgent: string | null;
      }[];
    };

    expect(body.sessions).toEqual([
      expect.objectContaining({
        id: 's1',
        userEmail: 'andrii@devflare.test',
        ipAddress: '203.0.113.5',
        userAgent: 'curl/8',
      }),
    ]);
  });

  it('renders missing ip/user-agent as null rather than inventing a value', async () => {
    seedUser('u1', 'andrii@devflare.test');
    seedSession('s1', 'u1');

    const request = createApp(createEnv());
    const body = (await (await request('', asAdmin())).json()) as {
      sessions: { ipAddress: string | null; userAgent: string | null }[];
    };

    expect(body.sessions[0]).toMatchObject({
      ipAddress: null,
      userAgent: null,
    });
  });

  it('filters by userId', async () => {
    seedUser('u1', 'a@test.dev');
    seedUser('u2', 'b@test.dev');
    seedSession('s1', 'u1');
    seedSession('s2', 'u2');

    const request = createApp(createEnv());
    const body = (await (await request('?userId=u1', asAdmin())).json()) as {
      sessions: { id: string }[];
    };

    expect(body.sessions.map((s) => s.id)).toEqual(['s1']);
  });

  it('never includes a session token', async () => {
    seedUser('u1', 'a@test.dev');
    seedSession('s1', 'u1');

    const request = createApp(createEnv());
    const raw = await (await request('', asAdmin())).text();
    expect(raw).not.toMatch(/token-s1/);
  });
});

describe('admin sessions API — revocation', () => {
  it('revokes exactly one session, not others for the same user', async () => {
    seedUser('u1', 'a@test.dev');
    seedSession('s1', 'u1');
    seedSession('s2', 'u1');

    const request = createApp(createEnv());
    const response = await request('/s1', asAdmin({ method: 'DELETE' }));
    expect(response.status).toBe(200);

    const remaining = d1.sqlite.prepare('SELECT id FROM session').all() as {
      id: string;
    }[];
    expect(remaining.map((r) => r.id)).toEqual(['s2']);
  });

  it('404s revoking a session that does not exist', async () => {
    const request = createApp(createEnv());
    const response = await request('/ghost', asAdmin({ method: 'DELETE' }));
    expect(response.status).toBe(404);
  });

  it('revokes every session for a user and none for another', async () => {
    seedUser('u1', 'a@test.dev');
    seedUser('u2', 'b@test.dev');
    seedSession('s1', 'u1');
    seedSession('s2', 'u1');
    seedSession('s3', 'u2');

    const request = createApp(createEnv());
    const response = await request('/user/u1', asAdmin({ method: 'DELETE' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ userId: 'u1', revoked: 2 });

    const remaining = d1.sqlite.prepare('SELECT id FROM session').all() as {
      id: string;
    }[];
    expect(remaining.map((r) => r.id)).toEqual(['s3']);
  });

  it('writes an audit row for revoke and revoke-all', async () => {
    seedUser('u1', 'a@test.dev');
    seedSession('s1', 'u1');
    seedSession('s2', 'u1');

    const request = createApp(createEnv());
    await request('/s1', asAdmin({ method: 'DELETE' }));
    await request('/user/u1', asAdmin({ method: 'DELETE' }));

    const rows = d1.sqlite
      .prepare(
        'SELECT action, targetType, clientId FROM oauthClientAudit ORDER BY rowid',
      )
      .all() as { action: string; targetType: string; clientId: string }[];

    expect(rows).toEqual([
      { action: 'revoke', targetType: 'session', clientId: 's1' },
      { action: 'revoke-all', targetType: 'session', clientId: 'u1' },
    ]);
  });
});
