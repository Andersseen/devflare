import type { RateLimitBinding } from './env';

/**
 * Rate limiting through Cloudflare's Workers Rate Limiting bindings
 * (`[[ratelimits]]` in wrangler.toml): auth routes by client IP, mutations (manual
 * sync) by user id. The webhook endpoint is deliberately not limited here: it
 * is authenticated by its HMAC signature, and throttling GitHub's own
 * deliveries would only create missed events.
 *
 * A missing binding means "not limited" (unit tests, a runtime without the
 * binding) and is logged once; a binding that errors also lets the request
 * through, because failing closed would turn a limiter outage into a sign-in
 * outage. Authorization never depends on this.
 */

export type RateLimitResult = 'allowed' | 'limited';

let warnedMissing = false;

export async function checkRateLimit(
  limiter: RateLimitBinding | undefined,
  key: string,
): Promise<RateLimitResult> {
  if (!limiter) {
    if (!warnedMissing) {
      warnedMissing = true;
      console.warn('[dev-radar] rate limiter binding missing; not limiting');
    }
    return 'allowed';
  }

  try {
    const { success } = await limiter.limit({ key });
    return success ? 'allowed' : 'limited';
  } catch {
    console.error('[dev-radar] rate limiter failed; request allowed');
    return 'allowed';
  }
}
