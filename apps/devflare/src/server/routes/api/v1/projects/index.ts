import { defineEventHandler, readBody, createError } from 'h3';
import { getAppSession, requireAuth } from '../../../../lib/session';
import { db } from '../../../../db';
import { rowsOf, type ProjectRow } from '../../../../lib/project-rows';

export default defineEventHandler(async (event) => {
  const session = await getAppSession(event);

  if (event.method === 'GET') {
    const user = requireAuth(session);
    const projects = rowsOf<ProjectRow>(
      await db.sql`SELECT * FROM projects WHERE userId = ${user.id} ORDER BY createdAt DESC`,
    );
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

    const project = rowsOf<ProjectRow>(
      await db.sql`SELECT * FROM projects WHERE id = ${id}`,
    )[0];
    return { project };
  }

  throw createError({ statusCode: 405, statusMessage: 'Method Not Allowed' });
});
