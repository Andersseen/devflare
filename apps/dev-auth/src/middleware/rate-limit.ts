import { createMiddleware } from 'hono/factory';
import type { Env } from '../index';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory fallback for local development
const memoryStore = new Map<string, RateLimitEntry>();

async function getRateLimitEntry(
  kv: KVNamespace | undefined,
  key: string,
): Promise<RateLimitEntry | null> {
  if (!kv) {
    const entry = memoryStore.get(key);
    return entry && entry.resetAt > Date.now() ? entry : null;
  }
  const raw = await kv.get(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as RateLimitEntry;
    return parsed.resetAt > Date.now() ? parsed : null;
  } catch {
    return null;
  }
}

async function setRateLimitEntry(
  kv: KVNamespace | undefined,
  key: string,
  entry: RateLimitEntry,
  ttlSeconds: number,
): Promise<void> {
  if (!kv) {
    memoryStore.set(key, entry);
    return;
  }
  await kv.put(key, JSON.stringify(entry), { expirationTtl: ttlSeconds });
}

/**
 * Rate limiter using Cloudflare KV in production, memory in local dev.
 * Limits: maxRequests per windowMs per IP+path.
 */
export function createRateLimitMiddleware(
  maxRequests = 10,
  windowMs = 60 * 1000, // 1 minute
) {
  return createMiddleware<{ Bindings: Env }>(async (c, next) => {
    const ip =
      c.req.header('cf-connecting-ip') ||
      c.req.header('x-forwarded-for') ||
      'unknown';

    const key = `rate_limit:${ip}:${c.req.path}`;
    const now = Date.now();
    const ttlSeconds = Math.ceil(windowMs / 1000);

    const entry = await getRateLimitEntry(c.env.RATE_LIMIT_KV, key);

    if (entry) {
      if (entry.count >= maxRequests) {
        c.header(
          'Retry-After',
          String(Math.ceil((entry.resetAt - now) / 1000)),
        );
        return c.json(
          { error: 'Too many requests. Please try again later.' },
          429,
        );
      }
      entry.count++;
      await setRateLimitEntry(c.env.RATE_LIMIT_KV, key, entry, ttlSeconds);
    } else {
      await setRateLimitEntry(
        c.env.RATE_LIMIT_KV,
        key,
        { count: 1, resetAt: now + windowMs },
        ttlSeconds,
      );
    }

    // Cleanup memory store periodically (local dev only)
    if (!c.env.RATE_LIMIT_KV && Math.random() < 0.01) {
      for (const [k, v] of memoryStore) {
        if (v.resetAt <= now) memoryStore.delete(k);
      }
    }

    await next();
  });
}
