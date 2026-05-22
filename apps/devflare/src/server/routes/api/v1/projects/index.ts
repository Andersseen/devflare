import { defineEventHandler, readBody, createError } from 'h3';
import { auth } from '../../../../auth';
import { db } from '../../../../db';

function requireAuth(session: { user?: { id: string } } | null) {
  if (!session?.user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }
  return session.user;
}

export default defineEventHandler(async (event) => {
  const session = await auth.api.getSession({ headers: event.headers });

  if (event.method === 'GET') {
    const user = requireAuth(session);
    const projects = await db.sql`SELECT * FROM projects WHERE userId = ${user.id} ORDER BY createdAt DESC`;
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
