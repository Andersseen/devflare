/**
 * Who has an identity with this provider: listing, detail, ban and unban.
 *
 * Same authorization and audit shape as ../routes/admin-clients.ts — an admin
 * session or a service token naming one, the CSRF header on writes, a row in
 * oauthClientAudit for every write. See spec 011 for why this is hand-rolled
 * rather than better-auth's `admin` plugin: that plugin's own request
 * authorization is role/adminUserIds-based, which this provider deliberately
 * does not use (a database write must never be able to promote an attacker to
 * admin — see ../lib/admin.ts), and it bundles impersonation and role-setting
 * endpoints this task explicitly does not want reachable at all.
 *
 * "Ban" is a binary switch, not the admin plugin's role/banExpires model — see
 * ../db/schema.ts's `user.bannedAt` and the `session.create.before` hook in
 * ../auth.config.ts that actually enforces it. Banning does not touch a
 * user's existing sessions; revoking those is ../routes/admin-sessions.ts.
 */

import { Hono } from 'hono';
import { eq, like, or } from 'drizzle-orm';
import type { Env } from '../index';
import { createDb } from '../db';
import { account, session, user } from '../db/schema';
import { authenticateAdmin, hasCsrfHeader, type Actor } from '../lib/admin';
import { audit } from '../lib/audit';

const adminUserRoutes = new Hono<{ Bindings: Env }>();

adminUserRoutes.use('*', async (c, next) => {
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

/** Every linked sign-in method and live session, grouped by user id. */
async function loadRelations(
  db: ReturnType<typeof createDb>,
  userIds: string[],
): Promise<{
  providers: Map<string, string[]>;
  sessionCounts: Map<string, number>;
}> {
  const providers = new Map<string, string[]>();
  const sessionCounts = new Map<string, number>();
  if (userIds.length === 0) return { providers, sessionCounts };

  const accountRows = await db
    .select({ userId: account.userId, providerId: account.providerId })
    .from(account);
  for (const row of accountRows) {
    if (!userIds.includes(row.userId)) continue;
    const list = providers.get(row.userId) ?? [];
    list.push(row.providerId);
    providers.set(row.userId, list);
  }

  const sessionRows = await db.select({ userId: session.userId }).from(session);
  for (const row of sessionRows) {
    if (!userIds.includes(row.userId)) continue;
    sessionCounts.set(row.userId, (sessionCounts.get(row.userId) ?? 0) + 1);
  }

  return { providers, sessionCounts };
}

function present(
  row: typeof user.$inferSelect,
  providers: string[],
  sessionCount: number,
) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: row.emailVerified,
    image: row.image,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    banned: row.bannedAt !== null,
    bannedAt: row.bannedAt,
    bannedReason: row.bannedReason,
    bannedBy: row.bannedBy,
    providers,
    sessionCount,
  };
}

adminUserRoutes.get('/', async (c) => {
  const q = c.req.query('q')?.trim();
  const db = createDb(c.env.DB);

  const rows = await db
    .select()
    .from(user)
    .where(
      q ? or(like(user.email, `%${q}%`), like(user.name, `%${q}%`)) : undefined,
    );

  const { providers, sessionCounts } = await loadRelations(
    db,
    rows.map((row) => row.id),
  );

  return c.json({
    users: rows.map((row) =>
      present(row, providers.get(row.id) ?? [], sessionCounts.get(row.id) ?? 0),
    ),
  });
});

adminUserRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const db = createDb(c.env.DB);

  const [row] = await db.select().from(user).where(eq(user.id, id));
  if (!row) return c.json({ error: 'no such user' }, 404);

  const { providers, sessionCounts } = await loadRelations(db, [id]);

  return c.json(
    present(row, providers.get(id) ?? [], sessionCounts.get(id) ?? 0),
  );
});

interface BanInput {
  reason?: unknown;
}

adminUserRoutes.post('/:id/ban', async (c) => {
  const id = c.req.param('id');
  const db = createDb(c.env.DB);
  const actor = actorOf(c);

  const [row] = await db.select().from(user).where(eq(user.id, id));
  if (!row) return c.json({ error: 'no such user' }, 404);

  const body = (await c.req.json().catch(() => ({}))) as BanInput;
  const reason = typeof body.reason === 'string' ? body.reason.trim() : null;

  await db
    .update(user)
    .set({
      bannedAt: new Date(),
      bannedReason: reason || null,
      bannedBy: actor.email,
      updatedAt: new Date(),
    })
    .where(eq(user.id, id));

  await audit(db, actor, {
    action: 'ban',
    targetType: 'user',
    targetId: id,
    changes: { reason },
  });

  return c.json({ id, banned: true });
});

adminUserRoutes.post('/:id/unban', async (c) => {
  const id = c.req.param('id');
  const db = createDb(c.env.DB);
  const actor = actorOf(c);

  const [row] = await db.select().from(user).where(eq(user.id, id));
  if (!row) return c.json({ error: 'no such user' }, 404);

  await db
    .update(user)
    .set({
      bannedAt: null,
      bannedReason: null,
      bannedBy: null,
      updatedAt: new Date(),
    })
    .where(eq(user.id, id));

  await audit(db, actor, { action: 'unban', targetType: 'user', targetId: id });

  return c.json({ id, banned: false });
});

export default adminUserRoutes;
