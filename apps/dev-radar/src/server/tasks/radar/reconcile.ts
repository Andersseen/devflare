import { defineTask } from 'nitropack/runtime';
import { runSync } from '../../lib/sync/run';

/**
 * Cron reconcile (wrangler `[triggers] crons`, mapped by `scheduledTasks` in
 * vite.config.ts): re-syncs from GitHub to catch webhooks DevRadar never
 * received. Runs without a request, so configuration comes from `process.env`
 * (Workers populate it from vars and secrets under nodejs_compat).
 */
export default defineTask({
  meta: {
    name: 'radar:reconcile',
    description: 'Reconcile mirrored GitHub state with GitHub',
  },
  async run() {
    const result = await runSync({});
    return { result: result ?? { skipped: 'GitHub App not configured' } };
  },
});
