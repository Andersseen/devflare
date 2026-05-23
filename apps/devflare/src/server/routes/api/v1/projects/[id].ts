import { defineEventHandler, getRouterParam, createError } from 'h3';
import { getRemoteSession, requireAuth } from '../../../../lib/auth-remote';
import { db } from '../../../../db';

export default defineEventHandler(async (event) => {
  const session = await getRemoteSession(event);
  const user = requireAuth(session);
  const id = getRouterParam(event, 'id');

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID is required' });
  }

  if (event.method === 'GET') {
    const projects = await db.sql`SELECT * FROM projects WHERE id = ${id} AND userId = ${user.id}`;
    if (!projects.length) {
      throw createError({ statusCode: 404, statusMessage: 'Project not found' });
    }
    return { project: projects[0] };
  }

  if (event.method === 'DELETE') {
    const projects = await db.sql`SELECT * FROM projects WHERE id = ${id} AND userId = ${user.id}`;
    if (!projects.length) {
      throw createError({ statusCode: 404, statusMessage: 'Project not found' });
    }

    await db.sql`DELETE FROM projects WHERE id = ${id}`;
    return { success: true };
  }

  throw createError({ statusCode: 405, statusMessage: 'Method Not Allowed' });
});
