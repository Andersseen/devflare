import type { H3Event } from 'h3';

/**
 * Runs `task` after the response has been sent, using the Worker's
 * `waitUntil` when the runtime offers it (production, wrangler dev). Without
 * one (plain Node, tests) the task still starts immediately and is simply
 * not awaited. Failures are logged by name only — task errors can carry
 * GitHub response fragments.
 */
export function runInBackground(
  event: H3Event,
  task: () => Promise<unknown>,
): void {
  const promise = task().catch((error: unknown) => {
    console.error(
      '[dev-radar] background task failed:',
      error instanceof Error ? error.name : 'unknown error',
    );
  });
  event.context.cloudflare?.context?.waitUntil?.(promise);
}
