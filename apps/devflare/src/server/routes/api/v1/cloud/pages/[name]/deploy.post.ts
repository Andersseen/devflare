import { createError, defineEventHandler, getRouterParam } from 'h3';
import { withCloudflare } from '../../../../../../lib/cloud-admin';
import {
  cfFetch,
  toDeploymentSummary,
  type PagesDeployment,
} from '../../../../../../lib/cloudflare';

/**
 * POST /api/v1/cloud/pages/:name/deploy — build and deploy the production
 * branch again.
 *
 * Only meaningful for a git-connected project: Cloudflare builds from the
 * branch it already knows. For a direct-upload project there is nothing to
 * rebuild from and the API says so, which is forwarded unchanged rather than
 * dressed up as success.
 *
 * Nothing is destroyed here — a Pages deployment adds to the history, and the
 * previous one stays available to roll back to.
 */
export default defineEventHandler((event) =>
  withCloudflare(event, async (config) => {
    const name = getRouterParam(event, 'name') ?? '';
    if (!name) {
      throw createError({ statusCode: 400, statusMessage: 'Name is required' });
    }

    const deployment = await cfFetch<PagesDeployment>(
      config,
      `/pages/projects/${encodeURIComponent(name)}/deployments`,
      { method: 'POST' },
    );

    return { deployment: toDeploymentSummary(deployment) };
  }),
);
