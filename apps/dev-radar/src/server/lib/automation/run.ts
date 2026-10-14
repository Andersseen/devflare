import { db } from '../../db';
import type { RequestContext } from '../env';
import { createRuntimeGitHub, resolveGitHubConfig } from '../github/runtime';
import { processDueRuns, type ProcessSummary } from './engine';

/**
 * Production wiring of the automation processor: Worker env -> GitHub App
 * client (null when unconfigured) -> processDueRuns against DevRadar's D1.
 * Shared by the scheduled task and the post-webhook nudge.
 */
export async function runAutomation(
  context: RequestContext,
  limit?: number,
): Promise<ProcessSummary> {
  const github = createRuntimeGitHub(resolveGitHubConfig(context));
  return processDueRuns({ db, github }, limit);
}
