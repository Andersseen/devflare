import { defineEventHandler } from 'h3';
import { withCloudflare } from '../../../../../lib/cloud-admin';
import {
  listWorkerDomains,
  listWorkers,
  type WorkerDomain,
} from '../../../../../lib/cloudflare';

/**
 * GET /api/v1/cloud/workers — every Worker script on the account, each with the
 * custom domains routed to it.
 *
 * Domains come from a separate endpoint and a separate token permission, so a
 * failure there degrades to "no domains listed" rather than hiding the Workers
 * themselves — the common case for a token scoped to scripts only.
 */
export default defineEventHandler((event) =>
  withCloudflare(event, async (config, refresh) => {
    const [scripts, domains] = await Promise.all([
      listWorkers(config, refresh),
      listWorkerDomains(config, refresh).catch(() => [] as WorkerDomain[]),
    ]);

    const byService = new Map<string, string[]>();
    for (const domain of domains) {
      const hostnames = byService.get(domain.service) ?? [];
      hostnames.push(domain.hostname);
      byService.set(domain.service, hostnames);
    }

    const workers = scripts
      .map((script) => ({
        name: script.id,
        createdOn: script.created_on,
        modifiedOn: script.modified_on,
        domains: byService.get(script.id) ?? [],
      }))
      .sort((a, b) => b.modifiedOn.localeCompare(a.modifiedOn));

    return { workers };
  }),
);
