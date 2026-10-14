import { defineTask } from 'nitropack/runtime';
import { runAutomation } from '../../lib/automation/run';

/**
 * Cron automation processor (wrangler `[triggers] crons`, mapped by
 * `scheduledTasks` in vite.config.ts): claims due automation runs, advances
 * them, retries transient failures and expires stale waits. Bounded to a few
 * runs per tick. Runs without a request, so configuration comes from
 * `process.env` (Workers populate it from vars and secrets under nodejs_compat).
 */
export default defineTask({
  meta: {
    name: 'radar:automation',
    description: 'Advance pending automation runs and prepare prompts',
  },
  async run() {
    return { result: await runAutomation({}) };
  },
});
