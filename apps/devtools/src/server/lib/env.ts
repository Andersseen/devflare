/**
 * DevTools' Worker environment: `vars` and bindings from wrangler.toml.
 *
 * On Cloudflare they arrive per request on `event.context.cloudflare.env`
 * (Nitro sets the same object in dev from wrangler's getPlatformProxy()).
 * `process.env` stays as the fallback for plain Node — vitest, scripts.
 * Deliberately h3-free so every library that reads configuration is testable
 * without the framework; routes pass `event.context`.
 */

/** The Workers Rate Limiting binding's API (`[[ratelimits]]`). */
export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface DevToolsEnv {
  DEV_AUTH_URL?: string;
  DEV_AUTH_CLIENT_ID?: string;
  DEV_AUTH_CLIENT_SECRET?: string;
  DEV_AUTH_REDIRECT_URI?: string;
  DEVTOOLS_ALLOWED_USERS?: string;
  SHORT_LINK_BASE_URL?: string;
  AUTH_RATE_LIMITER?: RateLimitBinding;
  MUTATION_RATE_LIMITER?: RateLimitBinding;
  INSPECT_RATE_LIMITER?: RateLimitBinding;
}

export interface RequestContext {
  cloudflare?: { env?: Partial<DevToolsEnv> & Record<string, unknown> };
}

export type StringVar = {
  [K in keyof DevToolsEnv]-?: DevToolsEnv[K] extends string | undefined
    ? K
    : never;
}[keyof DevToolsEnv];

export function envVar(
  context: RequestContext,
  key: StringVar,
): string | undefined {
  const value = context.cloudflare?.env?.[key];
  if (typeof value === 'string') return value;
  return typeof process !== 'undefined' ? process.env[key] : undefined;
}

export function binding<K extends keyof DevToolsEnv>(
  context: RequestContext,
  key: K,
): DevToolsEnv[K] | undefined {
  return context.cloudflare?.env?.[key] as DevToolsEnv[K] | undefined;
}
