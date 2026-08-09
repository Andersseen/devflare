import { describe, it, expect } from 'vitest';
import { memoryAdapter } from 'better-auth/adapters/memory';
import type { BetterAuthOptions } from 'better-auth';
import { withConfiguredClients } from '../client-registry';
import { parseOAuthClients, type RegisteredClient } from '../oauth-clients';

/**
 * The layer that makes `OAUTH_CLIENTS` the whole registry: client lookups are
 * answered from configuration, client writes have nowhere to go. It is the lock
 * that holds if the route blocks in src/index.ts or `clientPrivileges` in
 * auth.config.ts are ever removed, so it is tested on its own rather than only
 * through the provider.
 */

const DEVFLARE_REDIRECT = 'https://devflare.test/api/auth/callback';

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

async function adapterWith(clients: RegisteredClient[]) {
  const db: Record<string, unknown[]> = { user: [], oauthClient: [] };
  const factory = withConfiguredClients(memoryAdapter(db), clients);
  return { adapter: factory({} as BetterAuthOptions), db };
}

describe('withConfiguredClients', () => {
  it('answers a client lookup from configuration, not the database', async () => {
    const clients = await registry();
    const { adapter, db } = await adapterWith(clients);

    const found = await adapter.findOne<RegisteredClient>({
      model: 'oauthClient',
      where: [{ field: 'clientId', value: 'devflare' }],
    });

    expect(found?.clientId).toBe('devflare');
    expect(found?.redirectUris).toEqual([DEVFLARE_REDIRECT]);
    // The table stayed empty; nothing was seeded into it to make this work.
    expect(db['oauthClient']).toEqual([]);
  });

  it('does not know a client that is not configured', async () => {
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

  it.each([
    [
      'create',
      (a: Awaited<ReturnType<typeof adapterWith>>['adapter']) =>
        a.create({
          model: 'oauthClient',
          data: {
            clientId: 'attacker',
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
    [
      'deleteMany',
      (a: Awaited<ReturnType<typeof adapterWith>>['adapter']) =>
        a.deleteMany({ model: 'oauthClient', where: [] }),
    ],
  ])('refuses to %s a client', async (_label, operation) => {
    const { adapter } = await adapterWith(await registry());

    await expect(operation(adapter)).rejects.toThrow(
      /registered in configuration/,
    );
  });

  it('refuses client writes inside a transaction too', async () => {
    const { adapter } = await adapterWith(await registry());

    await expect(
      adapter.transaction((trx) =>
        trx.create({
          model: 'oauthClient',
          data: {
            clientId: 'attacker',
            redirectUris: ['https://evil.test/cb'],
          },
        }),
      ),
    ).rejects.toThrow(/registered in configuration/);
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
