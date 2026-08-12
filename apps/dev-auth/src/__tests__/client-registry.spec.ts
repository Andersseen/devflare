import { describe, it, expect } from 'vitest';
import { memoryAdapter } from 'better-auth/adapters/memory';
import type { BetterAuthOptions } from 'better-auth';
import { withHybridClients } from '../client-registry';
import { parseOAuthClients, type RegisteredClient } from '../oauth-clients';

/**
 * The layer that decides which clients exist: configuration first, the
 * `oauthClient` table second. It is the lock that holds if the route blocks in
 * src/index.ts or `clientPrivileges` in auth.config.ts are ever removed, so it
 * is tested on its own rather than only through the provider.
 */

const DEVFLARE_REDIRECT = 'https://devflare.test/api/auth/callback';
const RUNTIME_REDIRECT = 'https://runtime.test/auth/callback';

async function registry(): Promise<RegisteredClient[]> {
  const { clients } = await parseOAuthClients(
    JSON.stringify([
      {
        clientId: 'devflare',
        name: 'DevFlare',
        type: 'web',
        redirectURIs: [DEVFLARE_REDIRECT],
      },
    ]),
    JSON.stringify({ devflare: 'devflare-client-secret-with-entropy' }),
  );
  return clients;
}

/** A row as the admin API would have written it. */
function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'row-1',
    clientId: 'runtime-app',
    name: 'Runtime App',
    type: 'web',
    clientSecret: 'stored-hash',
    redirectUris: JSON.stringify([RUNTIME_REDIRECT]),
    ...overrides,
  };
}

/**
 * Reads now reach the real adapter, which resolves models against the schema
 * better-auth derives from its options — so the test has to declare the one
 * model it exercises. Only the columns ./lib/client-row.ts reads are listed.
 */
const OPTIONS = {
  plugins: [
    {
      id: 'test-oauth-client-model',
      schema: {
        oauthClient: {
          fields: {
            clientId: { type: 'string' },
            clientSecret: { type: 'string', required: false },
            name: { type: 'string', required: false },
            type: { type: 'string', required: false },
            redirectUris: { type: 'string' },
            postLogoutRedirectUris: { type: 'string', required: false },
            skipConsent: { type: 'boolean', required: false },
            enableEndSession: { type: 'boolean', required: false },
            disabled: { type: 'boolean', required: false },
          },
        },
      },
    },
  ],
} as unknown as BetterAuthOptions;

async function adapterWith(
  clients: RegisteredClient[],
  rows: Record<string, unknown>[] = [],
) {
  const db: Record<string, unknown[]> = { user: [], oauthClient: [...rows] };
  const factory = withHybridClients(memoryAdapter(db), clients);
  return { adapter: factory(OPTIONS), db };
}

describe('withHybridClients — reads', () => {
  it('answers a configured client from configuration, not the database', async () => {
    const { adapter, db } = await adapterWith(await registry());

    const found = await adapter.findOne<RegisteredClient>({
      model: 'oauthClient',
      where: [{ field: 'clientId', value: 'devflare' }],
    });

    expect(found?.clientId).toBe('devflare');
    expect(found?.redirectUris).toEqual([DEVFLARE_REDIRECT]);
    expect(db['oauthClient']).toEqual([]);
  });

  it('falls through to a database row for an unconfigured client', async () => {
    const { adapter } = await adapterWith(await registry(), [row()]);

    const found = await adapter.findOne<RegisteredClient>({
      model: 'oauthClient',
      where: [{ field: 'clientId', value: 'runtime-app' }],
    });

    expect(found?.clientId).toBe('runtime-app');
    expect(found?.redirectUris).toEqual([RUNTIME_REDIRECT]);
    // Normalised, not handed back raw.
    expect(found?.requirePKCE).toBe(true);
    expect(found?.skipConsent).toBe(false);
  });

  it('lets configuration win over a row claiming the same client id', async () => {
    const { adapter } = await adapterWith(await registry(), [
      row({
        clientId: 'devflare',
        redirectUris: JSON.stringify(['https://evil.test/cb']),
      }),
    ]);

    const found = await adapter.findOne<RegisteredClient>({
      model: 'oauthClient',
      where: [{ field: 'clientId', value: 'devflare' }],
    });

    expect(found?.redirectUris).toEqual([DEVFLARE_REDIRECT]);
  });

  it('does not list a shadowed row alongside the configured client', async () => {
    const { adapter } = await adapterWith(await registry(), [
      row({ clientId: 'devflare' }),
      row({ clientId: 'runtime-app' }),
    ]);

    const found = await adapter.findMany<RegisteredClient>({
      model: 'oauthClient',
    });

    expect(found.map((client) => client.clientId)).toEqual([
      'devflare',
      'runtime-app',
    ]);
  });

  it('counts configuration and rows together, without double counting', async () => {
    const { adapter } = await adapterWith(await registry(), [
      row({ clientId: 'devflare' }),
      row({ clientId: 'runtime-app' }),
    ]);

    expect(await adapter.count({ model: 'oauthClient' })).toBe(2);
  });

  it('does not resolve a row the normaliser rejects', async () => {
    // Same rules as the configuration path: this URI would never be accepted there.
    const { adapter } = await adapterWith(await registry(), [
      row({ redirectUris: JSON.stringify(['http://runtime.test/cb']) }),
    ]);

    expect(
      await adapter.findOne({
        model: 'oauthClient',
        where: [{ field: 'clientId', value: 'runtime-app' }],
      }),
    ).toBeNull();
  });

  it('knows nothing about a client that is neither configured nor stored', async () => {
    const { adapter } = await adapterWith(await registry());

    expect(
      await adapter.findOne({
        model: 'oauthClient',
        where: [{ field: 'clientId', value: 'not-registered' }],
      }),
    ).toBeNull();
  });

  it('matches nothing rather than everything on a filter it cannot apply', async () => {
    // A widened result set here would mean the wrong client answering a lookup.
    const { adapter } = await adapterWith(await registry());

    expect(
      await adapter.findOne({
        model: 'oauthClient',
        where: [
          { field: 'clientId', operator: 'contains', value: 'dev' } as never,
        ],
      }),
    ).toBeNull();
  });
});

describe('withHybridClients — writes', () => {
  it.each([
    [
      'create',
      (a: Awaited<ReturnType<typeof adapterWith>>['adapter']) =>
        a.create({
          model: 'oauthClient',
          data: {
            clientId: 'devflare',
            redirectUris: ['https://evil.test/cb'],
          },
        }),
    ],
    [
      'update',
      (a: Awaited<ReturnType<typeof adapterWith>>['adapter']) =>
        a.update({
          model: 'oauthClient',
          where: [{ field: 'clientId', value: 'devflare' }],
          update: { redirectUris: ['https://evil.test/cb'] },
        }),
    ],
    [
      'delete',
      (a: Awaited<ReturnType<typeof adapterWith>>['adapter']) =>
        a.delete({
          model: 'oauthClient',
          where: [{ field: 'clientId', value: 'devflare' }],
        }),
    ],
  ])('refuses to %s a configured client', async (_label, operation) => {
    const { adapter } = await adapterWith(await registry());

    await expect(operation(adapter)).rejects.toThrow(
      /registered in configuration/,
    );
  });

  it('refuses a write that names no client id at all', async () => {
    // `deleteMany` with no clause would otherwise take out rows for clients this
    // layer never got to check against configuration.
    const { adapter } = await adapterWith(await registry(), [row()]);

    await expect(
      adapter.deleteMany({ model: 'oauthClient', where: [] }),
    ).rejects.toThrow(/registered in configuration/);
  });

  it('refuses a configured-client write inside a transaction too', async () => {
    const { adapter } = await adapterWith(await registry());

    await expect(
      adapter.transaction((trx) =>
        trx.update({
          model: 'oauthClient',
          where: [{ field: 'clientId', value: 'devflare' }],
          update: { redirectUris: ['https://evil.test/cb'] },
        }),
      ),
    ).rejects.toThrow(/registered in configuration/);
  });

  it('allows writing a client configuration does not own', async () => {
    const { adapter, db } = await adapterWith(await registry());

    await adapter.create({
      model: 'oauthClient',
      data: row({ clientId: 'brand-new' }) as never,
    });

    expect(db['oauthClient']).toHaveLength(1);
  });

  it('allows deleting a stored client', async () => {
    const { adapter, db } = await adapterWith(await registry(), [row()]);

    await adapter.delete({
      model: 'oauthClient',
      where: [{ field: 'clientId', value: 'runtime-app' }],
    });

    expect(db['oauthClient']).toHaveLength(0);
  });

  it('leaves every other model alone', async () => {
    const { adapter, db } = await adapterWith(await registry());

    const created = await adapter.create<{ id: string; email: string }>({
      model: 'user',
      data: { email: 'owner@devflare.test' } as never,
    });

    expect(created.email).toBe('owner@devflare.test');
    expect(db['user']).toHaveLength(1);
  });
});
