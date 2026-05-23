import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { Env } from '../index';

const adminRoutes = new Hono<{ Bindings: Env }>();

/**
 * Middleware: admin endpoints require a secret token.
 */
adminRoutes.use(
  '*',
  createMiddleware<{ Bindings: Env }>(async (c, next) => {
    const authHeader = c.req.header('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    // In production, ADMIN_SECRET should be set via wrangler secret
    const expectedToken = c.env.ADMIN_SECRET;

    if (!expectedToken || token !== expectedToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    await next();
  }),
);

/**
 * POST /api/admin/backup
 * Triggers a D1 database backup via Cloudflare API.
 */
adminRoutes.post('/backup', async (c) => {
  try {
    const accountId = c.req.header('X-Account-Id');
    const apiToken = c.req.header('X-Api-Token');
    const databaseId = c.req.header('X-Database-Id');

    if (!accountId || !apiToken || !databaseId) {
      return c.json(
        {
          error: 'Missing X-Account-Id, X-Api-Token, or X-Database-Id headers',
        },
        400,
      );
    }

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/export`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          output_format: 'sql',
          current_schema_version: '1',
        }),
      },
    );

    const data = (await response.json()) as {
      success: boolean;
      result?: { signed_url?: string };
      errors?: Array<{ message: string }>;
    };

    if (!response.ok || !data.success) {
      const errors =
        data.errors?.map((e: { message: string }) => e.message).join(', ') ||
        'Export failed';
      return c.json({ success: false, error: errors }, 500);
    }

    return c.json({
      success: true,
      signedUrl: data.result?.signed_url,
      message: 'Backup initiated. Download from signed URL.',
    });
  } catch (err) {
    return c.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      },
      500,
    );
  }
});

/**
 * GET /api/admin/stats
 * Basic service stats.
 */
adminRoutes.get('/stats', async (c) => {
  const db = c.env.DB;

  try {
    const users = await db
      .prepare('SELECT COUNT(*) as count FROM user')
      .first<{ count: number }>();
    const sessions = await db
      .prepare('SELECT COUNT(*) as count FROM session')
      .first<{ count: number }>();

    return c.json({
      users: users?.count ?? 0,
      sessions: sessions?.count ?? 0,
      environment: c.env.ENVIRONMENT || 'development',
      timestamp: new Date().toISOString(),
    });
  } catch {
    return c.json({ error: 'Failed to fetch stats' }, 500);
  }
});

export default adminRoutes;
