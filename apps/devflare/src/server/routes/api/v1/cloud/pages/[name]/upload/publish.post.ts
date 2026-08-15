import { createError, defineEventHandler, getRouterParam, readBody } from 'h3';
import { withCloudflare } from '../../../../../../../lib/cloud-admin';
import { getAppSession, requireAuth } from '../../../../../../../lib/session';
import {
  clearCloudflareCache,
  toDeploymentSummary,
} from '../../../../../../../lib/cloudflare';
import { createPagesDeployment } from '../../../../../../../lib/pages-upload';
import { db } from '../../../../../../../db';
import { rowsOf, type ProjectRow } from '../../../../../../../lib/project-rows';

/**
 * POST /api/v1/cloud/pages/:name/upload/publish — turn an uploaded asset set
 * into a live deployment, and record it.
 *
 * This is the step that finally writes the `deployments` table. It has existed
 * since the very first migration and, until now, had no reader and no writer in
 * the whole repo — `deploy.page.ts` faked its upload with a setTimeout, so
 * there was never anything real to record.
 *
 * A row is only written when the caller names a DevFlare project to attribute
 * it to; `deployments.projectId` is NOT NULL with a foreign key, and inventing a
 * project to satisfy it would be worse than having no local history. Cloudflare
 * keeps the deployment either way, and /cloud reads it from there.
 */
export default defineEventHandler((event) =>
  withCloudflare(event, async (config) => {
    const name = getRouterParam(event, 'name') ?? '';
    if (!name) {
      throw createError({ statusCode: 400, statusMessage: 'Name is required' });
    }

    const body = (await readBody(event)) as {
      manifest?: unknown;
      branch?: unknown;
      commitMessage?: unknown;
      headers?: unknown;
      redirects?: unknown;
      projectId?: unknown;
    } | null;

    const manifest = body?.manifest;
    if (
      !manifest ||
      typeof manifest !== 'object' ||
      Array.isArray(manifest) ||
      Object.values(manifest).some((hash) => typeof hash !== 'string')
    ) {
      throw createError({
        statusCode: 400,
        statusMessage: 'manifest must be an object of path → hash',
      });
    }

    // Ownership is checked before the deployment, not after: a row that cannot
    // be attributed should not cost a live deploy first.
    const projectId =
      typeof body?.projectId === 'string' && body.projectId
        ? body.projectId
        : null;
    let project: ProjectRow | undefined;

    if (projectId) {
      const user = requireAuth(await getAppSession(event));
      project = rowsOf<ProjectRow>(
        await db.sql`SELECT * FROM projects WHERE id = ${projectId} AND userId = ${user.id}`,
      )[0];

      if (!project) {
        // 404 rather than 403 — whether someone else's project exists is not
        // this caller's business.
        throw createError({
          statusCode: 404,
          statusMessage: 'Project not found',
        });
      }
    }

    const deployment = await createPagesDeployment(config, name, {
      manifest: manifest as Record<string, string>,
      branch: typeof body?.branch === 'string' ? body.branch : undefined,
      commitMessage:
        typeof body?.commitMessage === 'string'
          ? body.commitMessage
          : undefined,
      headers: typeof body?.headers === 'string' ? body.headers : undefined,
      redirects:
        typeof body?.redirects === 'string' ? body.redirects : undefined,
    });

    const summary = toDeploymentSummary(deployment);

    // cfRequest has no cache of its own to drop, so the listings cfFetch holds
    // would otherwise keep serving a Cloud page without this deployment in it
    // for up to a minute.
    clearCloudflareCache();

    if (project) {
      await db.sql`INSERT INTO deployments (id, projectId, status, commitSha, previewUrl, createdAt)
        VALUES (${summary.id}, ${project.id}, ${summary.status}, ${null}, ${summary.url}, ${summary.createdOn})`;
    }

    return { deployment: summary, recorded: Boolean(project) };
  }),
);
