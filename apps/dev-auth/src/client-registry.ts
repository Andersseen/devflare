import type { DBAdapter, DBAdapterInstance, Where } from 'better-auth/types';
import type { RegisteredClient } from './oauth-clients';
import { toRegisteredClient, type OAuthClientRow } from './lib/client-row';

/**
 * Resolves the provider's client lookups from two sources: `OAUTH_CLIENTS`
 * first, then the `oauthClient` table.
 *
 * The provider plugin reads registered clients through the database adapter, on
 * a model it calls `oauthClient`. This wraps whichever adapter the service is
 * running on (drizzle over D1 in the Worker, in-memory in tests) and answers
 * that one model from configuration where configuration has an answer — every
 * other model, and every unclaimed client id, passes straight through.
 *
 * Configuration wins, and that ordering is the whole design:
 *
 *   - A configured client cannot be shadowed, altered or deleted by a row. The
 *     client that the admin UI itself signs in with lives in configuration, so
 *     compromising the UI cannot rewrite the way back into it.
 *   - Removing a client from `OAUTH_CLIENTS` still removes it from the provider
 *     on the next deploy; it does not silently fall through to a stale row.
 *   - Rows are normalised by ./lib/client-row.ts, which re-imposes the security
 *     properties configuration gets structurally — PKCE, the grant type, and the
 *     same redirect-URI rules. A row that fails validation resolves to nothing.
 *
 * Writes are allowed only for client ids configuration has not claimed. The
 * plugin's own client CRUD endpoints still cannot reach them: they are blocked
 * at the edge in src/index.ts and denied by `clientPrivileges` in
 * auth.config.ts. The admin API writes through this adapter deliberately.
 */

/** The model name the provider plugin uses for registered clients. */
const CLIENT_MODEL = 'oauthClient';

/**
 * Thrown when something tries to write a client that configuration owns. Not an
 * APIError: reaching this from the plugin is a bug in this service's own wiring,
 * and the admin API checks ownership before it calls, so this is the backstop
 * rather than the user-facing path.
 */
class ReadOnlyClientRegistryError extends Error {
  constructor(operation: string, clientId?: string) {
    super(
      `Refusing to ${operation} OAuth client${clientId ? ` "${clientId}"` : ''}: it is registered in configuration (OAUTH_CLIENTS), which the database cannot override.`,
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
 * The client id a write is aimed at, from either the data or the where clause.
 * Undefined means the write does not name one, in which case it cannot be
 * checked against configuration and is refused by the callers below.
 */
function targetClientId(
  where: Where[] | undefined,
  data?: Record<string, unknown>,
): string | undefined {
  const fromData = data?.['clientId'];
  if (typeof fromData === 'string') return fromData;

  const clause = where?.find(
    (entry) => entry.field === 'clientId' && (entry.operator ?? 'eq') === 'eq',
  );
  return typeof clause?.value === 'string' ? clause.value : undefined;
}

/**
 * Wraps an adapter factory so `oauthClient` resolves from `clients` first and
 * from the database second. Everything else — users, sessions, accounts,
 * tokens, consents, JWKS — goes straight to the real database.
 */
export function withHybridClients(
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
  const configured = new Set(clients.map((client) => client.clientId));

  /**
   * Refuses a write that configuration owns. A write that does not name a
   * client id is refused too: `deleteMany` with no clause would otherwise take
   * out rows for clients this layer never got to check.
   */
  const guardWrite = (
    operation: string,
    where: Where[] | undefined,
    data?: Record<string, unknown>,
  ) => {
    const clientId = targetClientId(where, data);
    if (clientId === undefined || configured.has(clientId)) {
      throw new ReadOnlyClientRegistryError(operation, clientId);
    }
  };

  return {
    ...adapter,

    findOne: async <T>(data: Parameters<DBAdapter['findOne']>[0]) => {
      if (!isClientModel(data.model)) return adapter.findOne<T>(data);

      const [match] = selectClients(clients, data.where);
      if (match) return match as T;

      const row = await adapter.findOne<OAuthClientRow>(data);
      return (toRegisteredClient(row) ?? null) as T | null;
    },

    findMany: async <T>(data: Parameters<DBAdapter['findMany']>[0]) => {
      if (!isClientModel(data.model)) return adapter.findMany<T>(data);

      const rows = await adapter.findMany<OAuthClientRow>(data);
      const fromDb = rows
        .map(toRegisteredClient)
        .filter((client): client is RegisteredClient => client !== null)
        // A row that shares a configured client id is not a second client; it is
        // shadowed entirely, so it must not appear alongside the real one.
        .filter((client) => !configured.has(client.clientId));

      const matches = [...selectClients(clients, data.where), ...fromDb];
      const offset = data.offset ?? 0;
      const limited =
        data.limit === undefined
          ? matches.slice(offset)
          : matches.slice(offset, offset + data.limit);
      return limited as T[];
    },

    count: async (data: Parameters<DBAdapter['count']>[0]) => {
      if (!isClientModel(data.model)) return adapter.count(data);
      const rows = await adapter.findMany<OAuthClientRow>({
        model: data.model,
        where: data.where,
      });
      const fromDb = rows
        .map(toRegisteredClient)
        .filter(
          (client): client is RegisteredClient =>
            client !== null && !configured.has(client.clientId),
        );
      return selectClients(clients, data.where).length + fromDb.length;
    },

    create: async <T extends Record<string, unknown>, R = T>(data: {
      model: string;
      data: Omit<T, 'id'>;
      select?: string[];
      forceAllowId?: boolean;
    }) => {
      if (isClientModel(data.model)) {
        guardWrite('create', undefined, data.data as Record<string, unknown>);
      }
      return adapter.create<T, R>(data);
    },

    update: async <T>(data: Parameters<DBAdapter['update']>[0]) => {
      if (isClientModel(data.model)) guardWrite('update', data.where);
      return adapter.update<T>(data);
    },

    updateMany: async (data: Parameters<DBAdapter['updateMany']>[0]) => {
      if (isClientModel(data.model)) guardWrite('update', data.where);
      return adapter.updateMany(data);
    },

    delete: async <T>(data: Parameters<DBAdapter['delete']>[0]) => {
      if (isClientModel(data.model)) guardWrite('delete', data.where);
      return adapter.delete<T>(data);
    },

    deleteMany: async (data: Parameters<DBAdapter['deleteMany']>[0]) => {
      if (isClientModel(data.model)) guardWrite('delete', data.where);
      return adapter.deleteMany(data);
    },

    consumeOne: async <T>(data: Parameters<DBAdapter['consumeOne']>[0]) => {
      if (isClientModel(data.model)) guardWrite('consume', data.where);
      return adapter.consumeOne<T>(data);
    },

    incrementOne: async <T>(data: Parameters<DBAdapter['incrementOne']>[0]) => {
      if (isClientModel(data.model)) guardWrite('increment', data.where);
      return adapter.incrementOne<T>(data);
    },

    // A transaction hands the callback a second adapter; without decorating it
    // too, anything the plugin does to `oauthClient` inside a transaction would
    // bypass every guard above.
    transaction: <R>(
      callback: (trx: Omit<DBAdapter, 'transaction'>) => Promise<R>,
    ) =>
      adapter.transaction((trx) =>
        callback(decorate(trx as DBAdapter, clients)),
      ),
  } as A;
}
