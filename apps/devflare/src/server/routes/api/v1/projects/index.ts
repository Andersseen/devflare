import { defineEventHandler, readBody, createError } from 'h3';
import { getRemoteSession, requireAuth } from '../../../../lib/auth-remote';
import { db } from '../../../../db';

export default defineEventHandler(async (event) => {
  const session = await getRemoteSession(event);

  if (event.method === 'GET') {
    const user = requireAuth(session);
    const projects =
      await db.sql`SELECT * FROM projects WHERE userId = ${user.id} ORDER BY createdAt DESC`;
    return { projects };
  }

  if (event.method === 'POST') {
    const user = requireAuth(session);
    const body = await readBody(event);

    if (!body?.name || typeof body.name !== 'string') {
      throw createError({ statusCode: 400, statusMessage: 'Name is required' });
    }

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    await db.sql`INSERT INTO projects (id, userId, name, repoUrl, createdAt) VALUES (${id}, ${user.id}, ${body.name}, ${body.repoUrl ?? null}, ${createdAt})`;

    const project = await db.sql`SELECT * FROM projects WHERE id = ${id}`;
    return { project: project[0] };
  }

  throw createError({ statusCode: 405, statusMessage: 'Method Not Allowed' });
});
