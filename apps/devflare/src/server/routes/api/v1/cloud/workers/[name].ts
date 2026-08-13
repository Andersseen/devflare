import { createError, defineEventHandler, getRouterParam } from 'h3';
import { withCloudflare } from '../../../../../lib/cloud-admin';
import {
  listWorkerDomains,
  listWorkerVersions,
  listWorkers,
} from '../../../../../lib/cloudflare';

/**
 * GET /api/v1/cloud/workers/:name — one Worker and the versions uploaded to it.
 *
 * Cloudflare has no "get one script" call that carries what this page shows, so
 * the script is picked out of the account listing (already memoized) and only
 * the version history is a new request.
 */
export default defineEventHandler((event) =>
  withCloudflare(event, async (config, refresh) => {
    const name = getRouterParam(event, 'name') ?? '';
    if (!name) {
      throw createError({ statusCode: 400, statusMessage: 'Name is required' });
    }

    const [scripts, versions, domains] = await Promise.all([
      listWorkers(config, refresh),
      // A Worker deployed before versioning existed has no version history, and
      // the endpoint 404s rather than returning an empty list.
      listWorkerVersions(config, name, refresh).catch(() => []),
      listWorkerDomains(config, refresh).catch(() => []),
    ]);

    const script = scripts.find((candidate) => candidate.id === name);
    if (!script) {
      throw createError({ statusCode: 404, statusMessage: 'Worker not found' });
    }

    return {
      worker: {
        name: script.id,
        createdOn: script.created_on,
        modifiedOn: script.modified_on,
        domains: domains
          .filter((domain) => domain.service === name)
          .map((domain) => domain.hostname),
      },
      versions: versions.map((version) => ({
        id: version.id,
        number: version.number ?? null,
        createdOn: version.metadata?.created_on ?? null,
        author: version.metadata?.author_email ?? null,
        source: version.metadata?.source ?? null,
        message: version.annotations?.['workers/message'] ?? null,
        tag: version.annotations?.['workers/tag'] ?? null,
      })),
    };
  }),
);
