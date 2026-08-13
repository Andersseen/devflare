import { defineEventHandler, getRouterParam, createError, readBody } from 'h3';
import { getAppSession, requireAuth } from '../../../../lib/session';
import { db } from '../../../../db';
import {
  parseLink,
  rowsOf,
  type ProjectRow,
} from '../../../../lib/project-rows';

export default defineEventHandler(async (event) => {
  const session = await getAppSession(event);
  const user = requireAuth(session);
  const id = getRouterParam(event, 'id');

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Project ID is required',
    });
  }

  const owned = rowsOf<ProjectRow>(
    await db.sql`SELECT * FROM projects WHERE id = ${id} AND userId = ${user.id}`,
  );

  if (!owned.length) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' });
  }

  if (event.method === 'GET') {
    return { project: owned[0] };
  }

  if (event.method === 'PATCH') {
    // Spec 005: link this row to the Worker or Pages project it deploys to, or
    // clear the link. Nothing is verified against Cloudflare here — a name that
    // stops resolving is shown as unlinked rather than blocking the edit.
    let link;
    try {
      link = parseLink(await readBody(event));
    } catch (error) {
      throw createError({
        statusCode: 400,
        statusMessage:
          error instanceof Error ? error.message : 'Invalid link payload',
      });
    }

    await db.sql`UPDATE projects SET cfType = ${link.cfType}, cfName = ${link.cfName} WHERE id = ${id} AND userId = ${user.id}`;

    const project = rowsOf<ProjectRow>(
      await db.sql`SELECT * FROM projects WHERE id = ${id}`,
    )[0];
    return { project };
  }

  if (event.method === 'DELETE') {
    await db.sql`DELETE FROM projects WHERE id = ${id} AND userId = ${user.id}`;
    return { success: true };
  }

  throw createError({ statusCode: 405, statusMessage: 'Method Not Allowed' });
});
