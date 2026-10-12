import type { DevRadarEnv } from './lib/env';

/**
 * Nitro's Cloudflare presets put the Worker's bindings on
 * `event.context.cloudflare.env` and the execution context beside it; h3's own
 * types know neither.
 */
declare module 'h3' {
  interface H3EventContext {
    cloudflare?: {
      env?: Partial<DevRadarEnv> & Record<string, unknown>;
      context?: { waitUntil?(promise: Promise<unknown>): void };
    };
  }
}
