import { defineEventHandler, getRouterParam, createError } from 'h3';
import { getAppSession, requireAuth } from '../../../../../lib/session';
import { db } from '../../../../../db';
import { rowsOf, type ProjectRow } from '../../../../../lib/project-rows';

/**
 * GET /api/v1/projects/:id/deployments — what DevFlare itself has deployed for
 * this project.
 *
 * The first reader the `deployments` table has ever had. It is DevFlare's own
 * record, not a mirror of Cloudflare's: only deployments made through this app
 * appear here, which is exactly what makes it worth keeping alongside /cloud —
 * that page shows everything the account has, from any source, and cannot say
 * which ones came from here.
 */
export interface DeploymentRow {
  id: string;
  projectId: string;
  status: string;
  commitSha: string | null;
  previewUrl: string | null;
  createdAt: string;
}

export default defineEventHandler(async (event) => {
  const user = requireAuth(await getAppSession(event));
  const id = getRouterParam(event, 'id');

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Project ID is required',
    });
  }

  // Ownership is proved against `projects`, not by trusting the id: a
  // deployments row is only reachable through a project the caller owns.
  const owned = rowsOf<ProjectRow>(
    await db.sql`SELECT id FROM projects WHERE id = ${id} AND userId = ${user.id}`,
  );

  if (!owned.length) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' });
  }

  const deployments = rowsOf<DeploymentRow>(
    await db.sql`SELECT * FROM deployments WHERE projectId = ${id} ORDER BY createdAt DESC LIMIT 20`,
  );

  return { deployments };
});
