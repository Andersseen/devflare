/**
 * Live DevAuth sessions: listing and revocation.
 *
 * Same authorization and audit shape as ../routes/admin-clients.ts. A plain
 * `DELETE` against the `session` table is used rather than a better-auth
 * `admin` plugin call — no such plugin is installed here (see spec 011), and a
 * direct delete is exactly what that plugin's own revoke endpoints do
 * underneath. Either way, an already-issued cookie can keep working for up to
 * five minutes after this runs: `session.cookieCache` (../auth.config.ts) is a
 * signed, client-held cache with its own maxAge, and deleting the D1 row does
 * not reach into a browser that is still holding one. That lag is inherent to
 * how better-auth's cache works, not something this router's approach adds.
 *
 * Never returns a session token — only the row's own id, which is what the
 * revoke endpoints below take, not the bearer credential.
 */

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { Env } from '../index';
import { createDb } from '../db';
import { session, user } from '../db/schema';
import { authenticateAdmin, hasCsrfHeader, type Actor } from '../lib/admin';
import { audit } from '../lib/audit';

const adminSessionRoutes = new Hono<{ Bindings: Env }>();

adminSessionRoutes.use('*', async (c, next) => {
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

function present(row: {
  id: string;
  userId: string;
  userEmail: string | null;
  userName: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}) {
  return {
    id: row.id,
    userId: row.userId,
    // Null only if the user row is somehow gone while the session is not —
    // not expected, but the session itself is still real and worth showing.
    userEmail: row.userEmail,
    userName: row.userName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    expiresAt: row.expiresAt,
    // Rendered as stored, including null — no device fingerprinting is added
    // on top of what better-auth already records.
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
  };
}

adminSessionRoutes.get('/', async (c) => {
  const userId = c.req.query('userId');
  const db = createDb(c.env.DB);

  const query = db
    .select({
      id: session.id,
      userId: session.userId,
      userEmail: user.email,
      userName: user.name,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      expiresAt: session.expiresAt,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
    })
    .from(session)
    .leftJoin(user, eq(session.userId, user.id));

  const rows = userId
    ? await query.where(eq(session.userId, userId))
    : await query;

  return c.json({ sessions: rows.map(present) });
});

adminSessionRoutes.delete('/user/:userId', async (c) => {
  const userId = c.req.param('userId');
  const db = createDb(c.env.DB);
  const actor = actorOf(c);

  const revoked = await db
    .delete(session)
    .where(eq(session.userId, userId))
    .returning({ id: session.id });

  await audit(db, actor, {
    action: 'revoke-all',
    targetType: 'session',
    targetId: userId,
    changes: { count: revoked.length },
  });

  return c.json({ userId, revoked: revoked.length });
});

adminSessionRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const db = createDb(c.env.DB);
  const actor = actorOf(c);

  const [row] = await db.select().from(session).where(eq(session.id, id));
  if (!row) return c.json({ error: 'no such session' }, 404);

  await db.delete(session).where(eq(session.id, id));

  await audit(db, actor, {
    action: 'revoke',
    targetType: 'session',
    targetId: id,
    changes: { userId: row.userId },
  });

  return c.json({ id, revoked: true });
});

export default adminSessionRoutes;
