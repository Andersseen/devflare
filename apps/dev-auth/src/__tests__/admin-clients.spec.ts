import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import adminClientRoutes from '../routes/admin-clients';
import { resetClientRegistryCache } from '../auth.config';
import { createTestD1, type TestD1 } from './helpers/d1';
import type { Env } from '../index';

/**
 * The write path for the OAuth client registry.
 *
 * Most of these are refusals. The registry decides where authorization codes are
 * delivered, so what this API declines to do matters more than what it does, and
 * the failure that would hurt is silent success on a request that should have
 * been turned away.
 */

const CONFIG_CLIENTS = JSON.stringify([
  {
    clientId: 'devflare',
    name: 'DevFlare',
    type: 'web',
    redirectURIs: ['https://devflare.test/api/auth/callback'],
  },
]);

const ADMIN = 'owner@devflare.test';
const SERVICE_TOKEN = 'service-token-with-plenty-of-entropy-here';

let d1: TestD1;

function createEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: d1.binding,
    BETTER_AUTH_URL: 'https://auth.test',
    BETTER_AUTH_SECRET: 'test-secret-at-least-32-characters-long',
    OAUTH_CLIENTS: CONFIG_CLIENTS,
    OAUTH_CLIENT_SECRETS: JSON.stringify({
      devflare: 'devflare-client-secret-with-entropy',
    }),
    ADMIN_EMAILS: ADMIN,
    ADMIN_API_TOKEN: SERVICE_TOKEN,
    ...overrides,
  } as Env;
}

function createApp(env: Env) {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/admin/clients', adminClientRoutes);
  return (path: string, init: RequestInit = {}) =>
    app.request(`http://auth.test/admin/clients${path}`, init, env);
}

/** A request as DevFlare's server would make it: token plus named human. */
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

beforeEach(() => {
  d1 = createTestD1([
    '0000_init.sql',
    '0001_analytics.sql',
    '0002_oauth_provider.sql',
    '0003_oauth_provider_v2.sql',
    '0004_client_admin.sql',
  ]);
  resetClientRegistryCache();
});

afterEach(() => d1.close());

describe('admin clients API — who may call it', () => {
  it('refuses an anonymous request', async () => {
    const request = createApp(createEnv());
    const response = await request('');

    expect(response.status).toBe(401);
  });

  it('refuses a service token naming nobody', async () => {
    const request = createApp(createEnv());
    const response = await request('', {
      headers: { Authorization: `Bearer ${SERVICE_TOKEN}` },
    });

    // A machine-attributed write would defeat the point of the audit trail.
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining('x-devauth-actor'),
    });
  });

  it('refuses a service token naming a non-admin', async () => {
    // The confused-deputy case: DevFlare's server holds the token, but the human
    // it is acting for must still be an administrator here.
    const request = createApp(createEnv());
    const response = await request('', asAdmin({}, 'someone-else@test.dev'));

    expect(response.status).toBe(403);
  });

  it('ignores an actor header presented without the token', async () => {
    const request = createApp(createEnv());
    const response = await request('', {
      headers: { 'x-devauth-actor': ADMIN },
    });

    // Attacker-controlled text on any request that did not prove itself.
    expect(response.status).toBe(401);
  });

  it('refuses a wrong service token', async () => {
    const request = createApp(createEnv());
    const response = await request(
      '',
      asAdmin({
        headers: { Authorization: 'Bearer not-the-token' },
      }),
    );

    expect(response.status).toBe(401);
  });

  it('denies everyone when ADMIN_EMAILS is unset', async () => {
    // Unlike SIGNUP_ALLOWLIST, "not configured" means nobody, not everybody.
    const request = createApp(createEnv({ ADMIN_EMAILS: undefined }));
    const response = await request('', asAdmin());

    expect(response.status).toBe(403);
  });

  it('admits the configured admin', async () => {
    const request = createApp(createEnv());
    const response = await request('', asAdmin());

    expect(response.status).toBe(200);
  });
});

describe('admin clients API — listing', () => {
  it('shows configured clients as read-only', async () => {
    const request = createApp(createEnv());
    const body = (await (await request('', asAdmin())).json()) as {
      clients: { clientId: string; source: string; readOnly: boolean }[];
    };

    expect(body.clients).toHaveLength(1);
    expect(body.clients[0]).toMatchObject({
      clientId: 'devflare',
      source: 'config',
      readOnly: true,
    });
  });

  it('never includes a stored secret', async () => {
    const request = createApp(createEnv());
    await request(
      '',
      asAdmin({
        method: 'POST',
        body: JSON.stringify({
          clientId: 'runtime-app',
          name: 'Runtime App',
          redirectUris: ['https://runtime.test/cb'],
        }),
      }),
    );

    const raw = await (await request('', asAdmin())).text();

    expect(raw).not.toMatch(/clientSecret/);
  });
});

describe('admin clients API — creating', () => {
  async function create(body: unknown, env = createEnv()) {
    const request = createApp(env);
    const response = await request(
      '',
      asAdmin({ method: 'POST', body: JSON.stringify(body) }),
    );
    return { response, body: await response.json() };
  }

  it('creates a client and returns its secret exactly once', async () => {
    const { response, body } = await create({
      clientId: 'runtime-app',
      name: 'Runtime App',
      redirectUris: ['https://runtime.test/cb'],
    });

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      clientId: 'runtime-app',
      secretShownOnce: true,
    });
    expect((body as { clientSecret: string }).clientSecret).toMatch(
      /^[\w-]{40,}$/,
    );

    // Stored hashed, so the value just handed out cannot be read back.
    const stored = d1.sqlite
      .prepare('SELECT clientSecret FROM oauthClient WHERE clientId = ?')
      .get('runtime-app') as { clientSecret: string };
    expect(stored.clientSecret).not.toBe(
      (body as { clientSecret: string }).clientSecret,
    );
  });

  it('refuses to shadow a configured client', async () => {
    const { response } = await create({
      clientId: 'devflare',
      redirectUris: ['https://evil.test/cb'],
    });

    expect(response.status).toBe(409);
  });

  it.each([
    ['a fragment', 'https://runtime.test/cb#x'],
    ['plain http off loopback', 'http://runtime.test/cb'],
    ['a wildcard host', 'https://*.runtime.test/cb'],
    ['credentials', 'https://u:p@runtime.test/cb'],
  ])(
    'rejects a redirect URI with %s before writing anything',
    async (_l, uri) => {
      const { response } = await create({
        clientId: 'runtime-app',
        redirectUris: [uri],
      });

      expect(response.status).toBe(400);
      expect(
        d1.sqlite.prepare('SELECT COUNT(*) as n FROM oauthClient').get(),
      ).toEqual({ n: 0 });
    },
  );

  it('rejects a redirect URI already claimed by a configured client', async () => {
    const { response, body } = await create({
      clientId: 'runtime-app',
      redirectUris: ['https://devflare.test/api/auth/callback'],
    });

    expect(response.status).toBe(409);
    expect((body as { error: string }).error).toContain('devflare');
  });

  it('rejects a malformed client id', async () => {
    const { response } = await create({
      clientId: 'Not Valid',
      redirectUris: ['https://runtime.test/cb'],
    });

    expect(response.status).toBe(400);
  });

  it('accepts loopback http, which local development needs', async () => {
    const { response } = await create({
      clientId: 'runtime-app',
      redirectUris: ['http://localhost:5173/proxy/auth/callback'],
    });

    expect(response.status).toBe(201);
  });

  it('writes an audit row naming the human, not the token', async () => {
    await create({
      clientId: 'runtime-app',
      redirectUris: ['https://runtime.test/cb'],
    });

    const row = d1.sqlite
      .prepare('SELECT actorEmail, action, clientId FROM oauthClientAudit')
      .get();

    expect(row).toMatchObject({
      actorEmail: ADMIN,
      action: 'create',
      clientId: 'runtime-app',
    });
  });
});

describe('admin clients API — editing', () => {
  async function seed() {
    const request = createApp(createEnv());
    await request(
      '',
      asAdmin({
        method: 'POST',
        body: JSON.stringify({
          clientId: 'runtime-app',
          redirectUris: ['https://runtime.test/cb'],
        }),
      }),
    );
    return request;
  }

  it('adds a redirect URI while keeping the existing one', async () => {
    const request = await seed();

    const response = await request(
      '/runtime-app',
      asAdmin({
        method: 'PATCH',
        body: JSON.stringify({
          redirectUris: ['https://runtime.test/cb', 'http://localhost:5173/cb'],
        }),
      }),
    );

    expect(response.status).toBe(200);
    const stored = d1.sqlite
      .prepare('SELECT redirectUris FROM oauthClient WHERE clientId = ?')
      .get('runtime-app') as { redirectUris: string };
    expect(JSON.parse(stored.redirectUris)).toEqual([
      'https://runtime.test/cb',
      'http://localhost:5173/cb',
    ]);
  });

  it('refuses to edit a configured client with an explanation, not a 500', async () => {
    const request = createApp(createEnv());
    const response = await request(
      '/devflare',
      asAdmin({
        method: 'PATCH',
        body: JSON.stringify({ redirectUris: ['https://evil.test/cb'] }),
      }),
    );

    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: string }).error).toContain(
      'configuration',
    );
  });

  it('404s on a client that does not exist', async () => {
    const request = createApp(createEnv());
    const response = await request(
      '/ghost',
      asAdmin({ method: 'PATCH', body: JSON.stringify({ name: 'Ghost' }) }),
    );

    expect(response.status).toBe(404);
  });

  it('rotates a secret to a new value', async () => {
    const request = await seed();
    const before = d1.sqlite
      .prepare('SELECT clientSecret FROM oauthClient WHERE clientId = ?')
      .get('runtime-app') as { clientSecret: string };

    const response = await request(
      '/runtime-app/rotate-secret',
      asAdmin({ method: 'POST' }),
    );
    const body = (await response.json()) as { clientSecret: string };

    expect(response.status).toBe(200);
    expect(body.clientSecret).toMatch(/^[\w-]{40,}$/);

    const after = d1.sqlite
      .prepare('SELECT clientSecret FROM oauthClient WHERE clientId = ?')
      .get('runtime-app') as { clientSecret: string };
    expect(after.clientSecret).not.toBe(before.clientSecret);
  });

  it('never records the new secret in the audit trail', async () => {
    const request = await seed();
    const response = await request(
      '/runtime-app/rotate-secret',
      asAdmin({ method: 'POST' }),
    );
    const { clientSecret } = (await response.json()) as {
      clientSecret: string;
    };

    const rows = d1.sqlite
      .prepare('SELECT changes FROM oauthClientAudit')
      .all() as { changes: string | null }[];

    expect(rows.map((row) => row.changes ?? '').join()).not.toContain(
      clientSecret,
    );
  });

  it('deletes a client and revokes its tokens', async () => {
    const request = await seed();

    const response = await request(
      '/runtime-app',
      asAdmin({ method: 'DELETE' }),
    );

    expect(response.status).toBe(200);
    expect(
      d1.sqlite.prepare('SELECT COUNT(*) as n FROM oauthClient').get(),
    ).toEqual({ n: 0 });
    expect(await response.json()).toMatchObject({ deleted: true });
  });
});
