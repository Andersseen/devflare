import type { DevToolsEnv } from './lib/env';

/**
 * Nitro's Cloudflare presets put the Worker's bindings on
 * `event.context.cloudflare.env`; h3's own types do not know that.
 */
declare module 'h3' {
  interface H3EventContext {
    cloudflare?: { env?: Partial<DevToolsEnv> & Record<string, unknown> };
  }
}
