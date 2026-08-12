/**
 * Managing the OAuth client registry at runtime.
 *
 * This is the private, authenticated counterpart to the plugin's own client CRUD
 * endpoints, which stay permanently 404 (see the block in ../index.ts). The
 * difference is not cosmetic: those implement RFC 7591 dynamic registration,
 * where *the caller* proposes a client and its redirect URIs. Here every write
 * is attributed to a named administrator and validated with the same rules the
 * configuration path uses.
 *
 * Configured clients are visible but not writable — ../client-registry.ts throws
 * on such a write, and this router checks first so the caller gets an
 * explanation instead of a 500.
 */

import { Hono } from 'hono';
import type { Env } from '../index';
import { createDb } from '../db';
import {
  oauthAccessToken,
  oauthClient,
  oauthClientAudit,
  oauthRefreshToken,
} from '../db/schema';
import { eq } from 'drizzle-orm';
import { authenticateAdmin, hasCsrfHeader, type Actor } from '../lib/admin';
import { hashClientSecret } from '../lib/client-secret';
import { validateUriList } from '../lib/redirect-uri';
import { getClientRegistry } from '../auth.config';
import { toRegisteredClient, type OAuthClientRow } from '../lib/client-row';

const adminClientRoutes = new Hono<{ Bindings: Env }>();

const CLIENT_TYPES = new Set(['web', 'native', 'user-agent-based']);
const SECRET_BYTES = 32;

/** Client ids appear in URLs and logs; keep them boring and unambiguous. */
const CLIENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function generateSecret(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(SECRET_BYTES)));
}

/**
 * Every mutation records who did what. Failing to write the audit row must not
 * fail the request that already succeeded, so this logs and moves on — the
 * alternative is a client that exists but reports an error, which is worse.
 */
async function audit(
  db: ReturnType<typeof createDb>,
  actor: Actor,
  action: string,
  clientId: string | null,
  changes?: unknown,
): Promise<void> {
  try {
    await db.insert(oauthClientAudit).values({
      id: crypto.randomUUID(),
      actorUserId: actor.userId ?? null,
      actorEmail: actor.email,
      action,
      clientId,
      changes: changes === undefined ? null : JSON.stringify(changes),
      createdAt: new Date(),
    });
  } catch (error) {
    console.error('[admin-clients] failed to write audit row', error);
  }
}

/** Public shape of a client. Never includes the stored secret, in any form. */
function present(
  client: {
    clientId: string;
    name: string;
    type: string;
    redirectUris: string[];
    postLogoutRedirectUris: string[];
    skipConsent: boolean;
    enableEndSession: boolean;
    public: boolean;
  },
  source: 'config' | 'managed',
) {
  return {
    clientId: client.clientId,
    name: client.name,
    type: client.type,
    redirectUris: client.redirectUris,
    postLogoutRedirectUris: client.postLogoutRedirectUris,
    skipConsent: client.skipConsent,
    enableEndSession: client.enableEndSession,
    public: client.public,
    source,
    /** Config clients cannot be edited here; the UI uses this, not a guess. */
    readOnly: source === 'config',
  };
}

adminClientRoutes.use('*', async (c, next) => {
  const result = await authenticateAdmin(c);
  if (!result.ok) return c.json({ error: result.error }, result.status);

  if (
    c.req.method !== 'GET' &&
    result.actor.via === 'session' &&
    !hasCsrfHeader(c)
  ) {
    return c.json({ error: 'missing x-devauth-admin header' }, 403);
  }

  c.set('actor' as never, result.actor as never);
  await next();
});

function actorOf(c: { get: (key: never) => unknown }): Actor {
  return c.get('actor' as never) as Actor;
}

/** Configured client ids, which no write may target. */
async function configuredIds(env: Env): Promise<Set<string>> {
  const { clients } = await getClientRegistry(env);
  return new Set(clients.map((client) => client.clientId));
}

adminClientRoutes.get('/', async (c) => {
  const { clients: configClients } = await getClientRegistry(c.env);
  const db = createDb(c.env.DB);
  const rows = await db.select().from(oauthClient);

  const configured = new Set(configClients.map((client) => client.clientId));
  const managed = rows
    .map((row) => toRegisteredClient(row as OAuthClientRow))
    .filter(
      (client): client is NonNullable<typeof client> =>
        client !== null && !configured.has(client.clientId),
    );

  return c.json({
    clients: [
      ...configClients.map((client) => present(client, 'config')),
      ...managed.map((client) => present(client, 'managed')),
    ],
  });
});

interface ClientInput {
  clientId?: unknown;
  name?: unknown;
  type?: unknown;
  redirectUris?: unknown;
  postLogoutRedirectUris?: unknown;
  skipConsent?: unknown;
  enableEndSession?: unknown;
}

adminClientRoutes.post('/', async (c) => {
  const body = (await c.req.json().catch(() => null)) as ClientInput | null;
  if (!body) return c.json({ error: 'expected a JSON body' }, 400);

  const clientId =
    typeof body.clientId === 'string' ? body.clientId.trim() : '';
  if (!CLIENT_ID_PATTERN.test(clientId)) {
    return c.json(
      {
        error:
          'clientId must be 3-64 characters of lowercase letters, digits and hyphens',
      },
      400,
    );
  }

  if ((await configuredIds(c.env)).has(clientId)) {
    return c.json(
      {
        error: `"${clientId}" is registered in configuration and cannot be edited here`,
      },
      409,
    );
  }

  const db = createDb(c.env.DB);
  const existing = await db
    .select()
    .from(oauthClient)
    .where(eq(oauthClient.clientId, clientId));
  if (existing.length > 0) {
    return c.json({ error: `"${clientId}" already exists` }, 409);
  }

  const type = typeof body.type === 'string' ? body.type : 'web';
  if (!CLIENT_TYPES.has(type)) {
    return c.json(
      { error: `type must be one of ${[...CLIENT_TYPES].join(', ')}` },
      400,
    );
  }

  const redirects = validateUriList(body.redirectUris, 'redirectUris');
  if (redirects.errors.length) {
    return c.json({ error: redirects.errors.join('; ') }, 400);
  }
  if (redirects.uris.length === 0) {
    return c.json({ error: 'redirectUris must not be empty' }, 400);
  }

  const postLogout = validateUriList(
    body.postLogoutRedirectUris ?? [],
    'postLogoutRedirectUris',
  );
  if (postLogout.errors.length) {
    return c.json({ error: postLogout.errors.join('; ') }, 400);
  }

  const collision = await findRedirectCollision(
    c.env,
    redirects.uris,
    clientId,
  );
  if (collision) return c.json({ error: collision }, 409);

  const isPublic = type !== 'web';
  const secret = isPublic ? undefined : generateSecret();

  await db.insert(oauthClient).values({
    id: crypto.randomUUID(),
    clientId,
    name:
      typeof body.name === 'string' && body.name.trim()
        ? body.name.trim()
        : clientId,
    type,
    public: isPublic,
    clientSecret: secret ? await hashClientSecret(secret) : null,
    redirectUris: JSON.stringify(redirects.uris),
    postLogoutRedirectUris: JSON.stringify(postLogout.uris),
    skipConsent: body.skipConsent === true,
    enableEndSession: body.enableEndSession === true,
    disabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await audit(db, actorOf(c), 'create', clientId, {
    redirectUris: redirects.uris,
    type,
  });

  return c.json(
    {
      clientId,
      // The only time this value exists outside a hash. It is not recoverable
      // afterwards, by this API or by anything else.
      clientSecret: secret,
      secretShownOnce: true,
    },
    201,
  );
});

adminClientRoutes.patch('/:clientId', async (c) => {
  const clientId = c.req.param('clientId');
  if ((await configuredIds(c.env)).has(clientId)) {
    return c.json(
      {
        error: `"${clientId}" is registered in configuration and cannot be edited here`,
      },
      409,
    );
  }

  const body = (await c.req.json().catch(() => null)) as ClientInput | null;
  if (!body) return c.json({ error: 'expected a JSON body' }, 400);

  const db = createDb(c.env.DB);
  const [row] = await db
    .select()
    .from(oauthClient)
    .where(eq(oauthClient.clientId, clientId));
  if (!row) return c.json({ error: 'no such client' }, 404);

  const update: Record<string, unknown> = { updatedAt: new Date() };
  const changes: Record<string, unknown> = {};

  if (body.redirectUris !== undefined) {
    const redirects = validateUriList(body.redirectUris, 'redirectUris');
    if (redirects.errors.length) {
      return c.json({ error: redirects.errors.join('; ') }, 400);
    }
    if (redirects.uris.length === 0) {
      return c.json({ error: 'redirectUris must not be empty' }, 400);
    }
    const collision = await findRedirectCollision(
      c.env,
      redirects.uris,
      clientId,
    );
    if (collision) return c.json({ error: collision }, 409);

    update['redirectUris'] = JSON.stringify(redirects.uris);
    changes['redirectUris'] = { from: row.redirectUris, to: redirects.uris };
  }

  if (body.postLogoutRedirectUris !== undefined) {
    const postLogout = validateUriList(
      body.postLogoutRedirectUris,
      'postLogoutRedirectUris',
    );
    if (postLogout.errors.length) {
      return c.json({ error: postLogout.errors.join('; ') }, 400);
    }
    update['postLogoutRedirectUris'] = JSON.stringify(postLogout.uris);
    changes['postLogoutRedirectUris'] = postLogout.uris;
  }

  if (typeof body.name === 'string' && body.name.trim()) {
    update['name'] = body.name.trim();
    changes['name'] = { from: row.name, to: body.name.trim() };
  }
  if (typeof body.skipConsent === 'boolean') {
    update['skipConsent'] = body.skipConsent;
    changes['skipConsent'] = body.skipConsent;
  }
  if (typeof body.enableEndSession === 'boolean') {
    update['enableEndSession'] = body.enableEndSession;
    changes['enableEndSession'] = body.enableEndSession;
  }

  // clientId is intentionally not updatable: changing it would orphan every
  // token already issued under the old one. Delete and create instead.
  await db
    .update(oauthClient)
    .set(update)
    .where(eq(oauthClient.clientId, clientId));
  await audit(db, actorOf(c), 'update', clientId, changes);

  return c.json({ clientId, updated: Object.keys(changes) });
});

adminClientRoutes.post('/:clientId/rotate-secret', async (c) => {
  const clientId = c.req.param('clientId');
  if ((await configuredIds(c.env)).has(clientId)) {
    return c.json(
      {
        error: `"${clientId}" is registered in configuration and cannot be edited here`,
      },
      409,
    );
  }

  const db = createDb(c.env.DB);
  const [row] = await db
    .select()
    .from(oauthClient)
    .where(eq(oauthClient.clientId, clientId));
  if (!row) return c.json({ error: 'no such client' }, 404);
  if (row.public) {
    return c.json({ error: 'public clients have no secret to rotate' }, 400);
  }

  const secret = generateSecret();
  await db
    .update(oauthClient)
    .set({
      clientSecret: await hashClientSecret(secret),
      updatedAt: new Date(),
    })
    .where(eq(oauthClient.clientId, clientId));

  // Records that a rotation happened, never what the value became.
  await audit(db, actorOf(c), 'rotate-secret', clientId);

  return c.json({ clientId, clientSecret: secret, secretShownOnce: true });
});

adminClientRoutes.delete('/:clientId', async (c) => {
  const clientId = c.req.param('clientId');
  if ((await configuredIds(c.env)).has(clientId)) {
    return c.json(
      {
        error: `"${clientId}" is registered in configuration and cannot be deleted here`,
      },
      409,
    );
  }

  const db = createDb(c.env.DB);
  const [row] = await db
    .select()
    .from(oauthClient)
    .where(eq(oauthClient.clientId, clientId));
  if (!row) return c.json({ error: 'no such client' }, 404);

  await db.delete(oauthClient).where(eq(oauthClient.clientId, clientId));

  // Deleting the client without its tokens would leave it working for the
  // refresh-token lifetime, which is not what "delete" reads as.
  const revoked = await revokeTokensFor(db, clientId);

  await audit(db, actorOf(c), 'delete', clientId, {
    redirectUris: row.redirectUris,
    revoked,
  });

  return c.json({ clientId, deleted: true, revoked });
});

/**
 * A callback shared by two clients would mean one endpoint receiving codes
 * issued to two identities, so it is refused across both sources.
 */
async function findRedirectCollision(
  env: Env,
  uris: string[],
  selfClientId: string,
): Promise<string | null> {
  const { clients } = await getClientRegistry(env);
  for (const client of clients) {
    if (client.clientId === selfClientId) continue;
    const clash = uris.find((uri) => client.redirectUris.includes(uri));
    if (clash) {
      return `redirect URI "${clash}" is already registered to "${client.clientId}"`;
    }
  }

  const db = createDb(env.DB);
  const rows = await db.select().from(oauthClient);
  for (const row of rows) {
    if (row.clientId === selfClientId) continue;
    const client = toRegisteredClient(row as OAuthClientRow);
    if (!client) continue;
    const clash = uris.find((uri) => client.redirectUris.includes(uri));
    if (clash) {
      return `redirect URI "${clash}" is already registered to "${client.clientId}"`;
    }
  }

  return null;
}

/** Drops the tokens a deleted client could still have used. */
async function revokeTokensFor(
  db: ReturnType<typeof createDb>,
  clientId: string,
): Promise<{ accessTokens: number; refreshTokens: number }> {
  const access = await db
    .delete(oauthAccessToken)
    .where(eq(oauthAccessToken.clientId, clientId))
    .returning({ id: oauthAccessToken.id });
  const refresh = await db
    .delete(oauthRefreshToken)
    .where(eq(oauthRefreshToken.clientId, clientId))
    .returning({ id: oauthRefreshToken.id });

  return { accessTokens: access.length, refreshTokens: refresh.length };
}

export default adminClientRoutes;
