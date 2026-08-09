import type { DBAdapter, DBAdapterInstance, Where } from 'better-auth/types';
import type { RegisteredClient } from './oauth-clients';

/**
 * Serves the OAuth provider's client lookups from configuration instead of D1.
 *
 * The provider plugin reads registered clients through the database adapter, on
 * a model it calls `oauthClient`. This wraps whichever adapter the service is
 * running on (drizzle over D1 in the Worker, in-memory in tests) and answers
 * that one model from ./oauth-clients.ts — every other model passes straight
 * through untouched.
 *
 * Three things follow from that, all of them the point of doing it this way:
 *
 *   - `OAUTH_CLIENTS` stays the whole registry. Deleting a client from the
 *     config deletes it from the provider on the next deploy; there is no row
 *     left in D1 that could still complete an authorization.
 *   - No client secret is ever written to the database, in any form.
 *   - The plugin's client CRUD endpoints (`/oauth2/create-client`,
 *     `/oauth2/register`, …) have nowhere to write, so they cannot invent a
 *     client with a redirect URI of the caller's choosing even if they were
 *     somehow reached. src/index.ts blocks them at the edge as well, and
 *     `clientPrivileges` denies them in auth.config.ts — this is the layer that
 *     holds if either of those is ever removed.
 *
 * The `oauthClient` table still exists in D1 (see db/migrations) so the plugin's
 * foreign keys resolve, but nothing reads or writes it.
 */

/** The model name the provider plugin uses for registered clients. */
const CLIENT_MODEL = 'oauthClient';

/**
 * Thrown when something tries to write a client. Not an APIError: reaching this
 * is a bug in this service's own wiring, not a request the caller got wrong, and
 * it should surface as a 500 in the logs rather than be reported as a usable
 * OAuth error a caller could iterate against.
 */
class ReadOnlyClientRegistryError extends Error {
  constructor(operation: string) {
    super(
      `Refusing to ${operation} an OAuth client: clients are registered in configuration (OAUTH_CLIENTS), not in the database.`,
    );
    this.name = 'ReadOnlyClientRegistryError';
  }
}

/**
 * Applies the adapter's `where` clauses to the configured client list.
 *
 * Only the comparisons the plugin actually issues are supported — equality on a
 * single field, which is how it looks a client up by `clientId`. Anything else
 * matches nothing rather than matching everything: a filter this layer does not
 * understand must never widen the result set.
 */
function selectClients(
  clients: RegisteredClient[],
  where: Where[] | undefined,
): RegisteredClient[] {
  if (!where || where.length === 0) return clients;

  return clients.filter((client) =>
    where.every((clause) => {
      const operator = clause.operator ?? 'eq';
      if (operator !== 'eq') return false;
      if (clause.connector && clause.connector !== 'AND') return false;

      const value = (client as unknown as Record<string, unknown>)[
        clause.field
      ];
      return value === clause.value;
    }),
  );
}

/**
 * Wraps an adapter factory so the `oauthClient` model is answered from
 * `clients`. Everything else — users, sessions, accounts, tokens, consents,
 * JWKS — goes to the real database.
 */
export function withConfiguredClients(
  database: DBAdapterInstance,
  clients: RegisteredClient[],
): DBAdapterInstance {
  return (options) => {
    const adapter = database(options);
    return decorate(adapter, clients);
  };
}

function decorate<A extends DBAdapter>(
  adapter: A,
  clients: RegisteredClient[],
): A {
  const isClientModel = (model: string) => model === CLIENT_MODEL;

  return {
    ...adapter,

    findOne: async <T>(data: Parameters<DBAdapter['findOne']>[0]) => {
      if (!isClientModel(data.model)) return adapter.findOne<T>(data);
      const [match] = selectClients(clients, data.where);
      return (match ?? null) as T | null;
    },

    findMany: async <T>(data: Parameters<DBAdapter['findMany']>[0]) => {
      if (!isClientModel(data.model)) return adapter.findMany<T>(data);
      const matches = selectClients(clients, data.where);
      const offset = data.offset ?? 0;
      const limited =
        data.limit === undefined
          ? matches.slice(offset)
          : matches.slice(offset, offset + data.limit);
      return limited as T[];
    },

    count: async (data: Parameters<DBAdapter['count']>[0]) => {
      if (!isClientModel(data.model)) return adapter.count(data);
      return selectClients(clients, data.where).length;
    },

    create: async <T extends Record<string, unknown>, R = T>(data: {
      model: string;
      data: Omit<T, 'id'>;
      select?: string[];
      forceAllowId?: boolean;
    }) => {
      if (isClientModel(data.model)) {
        throw new ReadOnlyClientRegistryError('create');
      }
      return adapter.create<T, R>(data);
    },

    update: async <T>(data: Parameters<DBAdapter['update']>[0]) => {
      if (isClientModel(data.model)) {
        throw new ReadOnlyClientRegistryError('update');
      }
      return adapter.update<T>(data);
    },

    updateMany: async (data: Parameters<DBAdapter['updateMany']>[0]) => {
      if (isClientModel(data.model)) {
        throw new ReadOnlyClientRegistryError('update');
      }
      return adapter.updateMany(data);
    },

    delete: async <T>(data: Parameters<DBAdapter['delete']>[0]) => {
      if (isClientModel(data.model)) {
        throw new ReadOnlyClientRegistryError('delete');
      }
      return adapter.delete<T>(data);
    },

    deleteMany: async (data: Parameters<DBAdapter['deleteMany']>[0]) => {
      if (isClientModel(data.model)) {
        throw new ReadOnlyClientRegistryError('delete');
      }
      return adapter.deleteMany(data);
    },

    consumeOne: async <T>(data: Parameters<DBAdapter['consumeOne']>[0]) => {
      if (isClientModel(data.model)) {
        throw new ReadOnlyClientRegistryError('consume');
      }
      return adapter.consumeOne<T>(data);
    },

    incrementOne: async <T>(data: Parameters<DBAdapter['incrementOne']>[0]) => {
      if (isClientModel(data.model)) {
        throw new ReadOnlyClientRegistryError('increment');
      }
      return adapter.incrementOne<T>(data);
    },

    // A transaction hands the callback a second adapter; without decorating it
    // too, anything the plugin does to `oauthClient` inside a transaction would
    // bypass every guard above and hit the empty D1 table instead.
    transaction: <R>(
      callback: (trx: Omit<DBAdapter, 'transaction'>) => Promise<R>,
    ) =>
      adapter.transaction((trx) =>
        callback(decorate(trx as DBAdapter, clients)),
      ),
  } as A;
}
