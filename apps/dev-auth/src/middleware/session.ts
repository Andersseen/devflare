import { createMiddleware } from 'hono/factory';
import { createAuth } from '../auth.config';
import type { Env } from '../index';

/**
 * Middleware that validates the session and injects user/session into context.
 * Use on protected routes (e.g. /setup).
 */
export const authMiddleware = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const auth = createAuth(c.env);

  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // @ts-expect-error - extend Hono context with session data
  c.set('user', session.user);
  // @ts-expect-error
  c.set('session', session.session);

  await next();
});
