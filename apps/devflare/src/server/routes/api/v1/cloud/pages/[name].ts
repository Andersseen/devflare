import { createError, defineEventHandler, getRouterParam } from 'h3';
import { withCloudflare } from '../../../../../lib/cloud-admin';
import {
  listPagesDeployments,
  listPagesProjects,
  toDeploymentSummary,
} from '../../../../../lib/cloudflare';

/**
 * GET /api/v1/cloud/pages/:name — one Pages project and its recent deployments.
 *
 * The project comes out of the account listing (already memoized) so that the
 * page can show domains and the production branch alongside the history without
 * a second project call.
 */
export default defineEventHandler((event) =>
  withCloudflare(event, async (config, refresh) => {
    const name = getRouterParam(event, 'name') ?? '';
    if (!name) {
      throw createError({ statusCode: 400, statusMessage: 'Name is required' });
    }

    const [found, deployments] = await Promise.all([
      listPagesProjects(config, refresh),
      listPagesDeployments(config, name, refresh),
    ]);

    const project = found.find((candidate) => candidate.name === name);
    if (!project) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Project not found',
      });
    }

    return {
      project: {
        name: project.name,
        subdomain: project.subdomain,
        domains: project.domains ?? [],
        productionBranch: project.production_branch,
        createdOn: project.created_on,
        repo: project.source?.config?.repo_name
          ? `${project.source.config.owner ?? ''}/${project.source.config.repo_name}`
          : null,
        // Only a git-connected project has a branch Cloudflare can build from.
        // A direct-upload project (CI running `wrangler pages deploy`) still
        // records branch and commit on each deployment, so this is the only
        // reliable signal — and it is what gates the Deploy button.
        gitConnected: Boolean(project.source?.type),
        latestDeployment: project.latest_deployment
          ? toDeploymentSummary(project.latest_deployment)
          : null,
      },
      deployments: deployments.map(toDeploymentSummary),
    };
  }),
);
