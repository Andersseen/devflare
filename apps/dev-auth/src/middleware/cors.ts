import { cors } from 'hono/cors';
import type { Env } from '../index';

/**
 * CORS middleware configurable via env vars.
 * In production, DEV_AUTH_CORS_ORIGINS MUST be set explicitly.
 * Wildcard '*' is rejected in production for security.
 */
export function createCorsMiddleware() {
  return cors({
    origin: (origin, c) => {
      const ctx = c as unknown as { env: Env };
      const isProd = ctx.env.ENVIRONMENT === 'production';

      const allowedOrigins = ctx.env.DEV_AUTH_CORS_ORIGINS
        ? ctx.env.DEV_AUTH_CORS_ORIGINS.split(',').map((o: string) => o.trim())
        : [
            'http://localhost:4200',
            'http://localhost:5173',
            'http://localhost:3000',
            'http://127.0.0.1:4200',
            'http://127.0.0.1:5173',
            'http://127.0.0.1:3000',
          ];

      // Reject wildcard in production
      if (isProd && allowedOrigins.includes('*')) {
        console.error('[CORS] Wildcard origin rejected in production');
        return null;
      }

      if (
        allowedOrigins.includes(origin) ||
        (!isProd && allowedOrigins.includes('*'))
      ) {
        return origin;
      }
      return null;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    maxAge: 86400,
  });
}
