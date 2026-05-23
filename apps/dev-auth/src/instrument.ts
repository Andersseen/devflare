import { wrapRequestHandler } from '@sentry/cloudflare';
import type { ExecutionContext } from '@cloudflare/workers-types';

/**
 * Wrap the fetch handler with Sentry error tracking.
 * Set SENTRY_DSN via wrangler secret in production.
 */
export function withSentry(
  request: Request,
  env: { SENTRY_DSN?: string; ENVIRONMENT?: string },
  ctx: ExecutionContext,
  handler: () => Promise<Response> | Response,
): Promise<Response> {
  if (!env.SENTRY_DSN) {
    return Promise.resolve(handler());
  }

  return wrapRequestHandler(
    {
      options: {
        dsn: env.SENTRY_DSN,
        environment: env.ENVIRONMENT || 'development',
        tracesSampleRate: env.ENVIRONMENT === 'production' ? 0.1 : 1.0,
      },
      request,
      context: ctx,
    },
    handler,
  );
}
