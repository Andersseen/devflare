import { createError, defineEventHandler, getRouterParam, readBody } from 'h3';
import { withCloudflare } from '../../../../../../lib/cloud-admin';
import {
  cfFetch,
  toDeploymentSummary,
  type PagesDeployment,
} from '../../../../../../lib/cloudflare';

/**
 * POST /api/v1/cloud/pages/:name/rollback — put an earlier deployment back in
 * production.
 *
 * Additive like a deploy: Cloudflare creates a new production deployment from
 * the existing build rather than deleting anything, so this is reversible by
 * rolling forward again.
 */
export default defineEventHandler((event) =>
  withCloudflare(event, async (config) => {
    const name = getRouterParam(event, 'name') ?? '';
    if (!name) {
      throw createError({ statusCode: 400, statusMessage: 'Name is required' });
    }

    const body = (await readBody(event)) as { deploymentId?: unknown } | null;
    const deploymentId = body?.deploymentId;

    if (typeof deploymentId !== 'string' || !deploymentId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'deploymentId is required',
      });
    }

    const deployment = await cfFetch<PagesDeployment>(
      config,
      `/pages/projects/${encodeURIComponent(name)}/deployments/${encodeURIComponent(deploymentId)}/rollback`,
      { method: 'POST' },
    );

    return { deployment: toDeploymentSummary(deployment) };
  }),
);
