import { defineEventHandler } from 'h3';
import { withCloudflare } from '../../../../../lib/cloud-admin';
import {
  listPagesProjects,
  toDeploymentSummary,
} from '../../../../../lib/cloudflare';

/**
 * GET /api/v1/cloud/pages — every Pages project, with the deployment currently
 * live on it. One upstream call: `latest_deployment` is already embedded in the
 * project, so listing does not fan out per project.
 */
export default defineEventHandler((event) =>
  withCloudflare(event, async (config, refresh) => {
    const found = await listPagesProjects(config, refresh);

    const projects = found
      .map((project) => ({
        name: project.name,
        subdomain: project.subdomain,
        domains: project.domains ?? [],
        productionBranch: project.production_branch,
        createdOn: project.created_on,
        repo: project.source?.config?.repo_name
          ? `${project.source.config.owner ?? ''}/${project.source.config.repo_name}`
          : null,
        gitConnected: Boolean(project.source?.type),
        latestDeployment: project.latest_deployment
          ? toDeploymentSummary(project.latest_deployment)
          : null,
      }))
      .sort((a, b) =>
        (b.latestDeployment?.createdOn ?? b.createdOn).localeCompare(
          a.latestDeployment?.createdOn ?? a.createdOn,
        ),
      );

    return { projects };
  }),
);
