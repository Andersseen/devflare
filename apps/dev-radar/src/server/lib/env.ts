/**
 * DevRadar's Worker environment: `vars`, secrets and bindings.
 *
 * On Cloudflare they arrive per request on `event.context.cloudflare.env`
 * (Nitro sets the same object in dev from wrangler's getPlatformProxy()).
 * `process.env` stays as the fallback for plain Node — vitest, scripts, and
 * the E2E dev server. Deliberately h3-free so every library that reads
 * configuration is testable without the framework; routes pass `event.context`.
 */

/** The Workers Rate Limiting binding's API (`[[ratelimits]]`). */
export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface DevRadarEnv {
  DEV_AUTH_URL?: string;
  DEV_AUTH_CLIENT_ID?: string;
  /** Secret. */
  DEV_AUTH_CLIENT_SECRET?: string;
  DEV_AUTH_REDIRECT_URI?: string;
  DEVRADAR_ALLOWED_USERS?: string;
  GITHUB_APP_ID?: string;
  GITHUB_APP_SLUG?: string;
  /** Secret. PEM, PKCS#1 or PKCS#8, real or `\n`-escaped newlines. */
  GITHUB_APP_PRIVATE_KEY?: string;
  /** Secret. */
  GITHUB_WEBHOOK_SECRET?: string;
  GITHUB_SYNC_REQUEST_BUDGET?: string;
  /** Development/E2E only: a local fake of api.github.com. Unset in production. */
  GITHUB_API_BASE_URL?: string;
  AUTH_RATE_LIMITER?: RateLimitBinding;
  MUTATION_RATE_LIMITER?: RateLimitBinding;
  PREFERENCES_RATE_LIMITER?: RateLimitBinding;
  /** Automation rules and prompt status changes (spec 023). */
  AUTOMATION_RATE_LIMITER?: RateLimitBinding;
}

export interface RequestContext {
  cloudflare?: { env?: Partial<DevRadarEnv> & Record<string, unknown> };
}

export type StringVar = {
  [K in keyof DevRadarEnv]-?: DevRadarEnv[K] extends string | undefined
    ? K
    : never;
}[keyof DevRadarEnv];

export function envVar(
  context: RequestContext,
  key: StringVar,
): string | undefined {
  const value = context.cloudflare?.env?.[key];
  if (typeof value === 'string' && value !== '') return value;
  const fallback =
    typeof process !== 'undefined' ? process.env[key] : undefined;
  return fallback === '' ? undefined : fallback;
}

export function binding<K extends keyof DevRadarEnv>(
  context: RequestContext,
  key: K,
): DevRadarEnv[K] | undefined {
  return context.cloudflare?.env?.[key] as DevRadarEnv[K] | undefined;
}
