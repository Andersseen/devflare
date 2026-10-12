import type { SyncResultDto } from '../../../shared/dto';
import { db } from '../../db';
import type { RequestContext } from '../env';
import { createEventStoreSink } from '../store/events';
import { createRuntimeGitHub, resolveGitHubConfig } from '../github/runtime';
import { syncAll, type SyncOptions } from './sync';

/**
 * The production wiring of a sync run: Worker env -> GitHub App client ->
 * syncAll against DevRadar's D1. Shared by the manual refresh, the
 * webhook-triggered import and the cron reconcile.
 *
 * null = the GitHub App is not configured (the disconnected state).
 */
export async function runSync(
  context: RequestContext,
  options: SyncOptions = {},
): Promise<SyncResultDto | null> {
  const github = createRuntimeGitHub(resolveGitHubConfig(context));
  if (!github) return null;

  return syncAll(
    {
      db,
      api: github.api,
      budget: github.budget,
      sink: createEventStoreSink(db),
    },
    options,
  );
}
