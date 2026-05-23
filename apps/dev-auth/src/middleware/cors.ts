import { cors } from 'hono/cors';
import type { Env } from '../index';

/**
 * CORS middleware configurable via env vars.
 * Allow origins from DEV_AUTH_CORS_ORIGINS (comma-separated) or defaults to localhost.
 */
export function createCorsMiddleware() {
  return cors({
    origin: (origin, c) => {
      const ctx = c as unknown as { env: Env };
      const allowedOrigins = ctx.env.DEV_AUTH_CORS_ORIGINS
        ? ctx.env.DEV_AUTH_CORS_ORIGINS.split(',').map((o: string) => o.trim())
        : ['http://localhost:4200', 'http://localhost:5173', 'http://localhost:3000'];

      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
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
