import { createMiddleware } from 'hono/factory';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

/**
 * Simple in-memory rate limiter for auth endpoints.
 * Limits: 10 requests per minute per IP.
 * Note: In production with multiple workers, use KV or Durable Objects.
 */
export function createRateLimitMiddleware(
  maxRequests = 10,
  windowMs = 60 * 1000 // 1 minute
) {
  return createMiddleware(async (c, next) => {
    const ip = c.req.header('cf-connecting-ip')
      || c.req.header('x-forwarded-for')
      || 'unknown';

    const key = `${ip}:${c.req.path}`;
    const now = Date.now();

    const entry = store.get(key);
    if (entry && entry.resetAt > now) {
      if (entry.count >= maxRequests) {
        return c.json(
          { error: 'Too many requests. Please try again later.' },
          429
        );
      }
      entry.count++;
    } else {
      store.set(key, { count: 1, resetAt: now + windowMs });
    }

    // Cleanup old entries periodically
    if (Math.random() < 0.01) {
      for (const [k, v] of store) {
        if (v.resetAt <= now) store.delete(k);
      }
    }

    await next();
  });
}
