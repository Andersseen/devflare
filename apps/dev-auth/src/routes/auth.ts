import { Hono } from 'hono';
import { createAuth } from '../auth.config';
import type { Env } from '../index';

const authRoutes = new Hono<{ Bindings: Env }>();

authRoutes.all('/*', async (c) => {
  const auth = createAuth(c.env);
  const request = c.req.raw;
  const response = await auth.handler(request);
  return response;
});

export default authRoutes;
