import { Hono } from 'hono';
import type { Env } from '../index';

const analyticsRoutes = new Hono<{ Bindings: Env }>();

interface AnalyticsEvent {
  event: string;
  path?: string;
  userAgent?: string;
  timestamp: string;
}

/**
 * POST /api/analytics/event
 * Receive analytics events from the frontend.
 * Lightweight — stores in D1 for aggregation.
 */
analyticsRoutes.post('/event', async (c) => {
  try {
    const body = await c.req.json<AnalyticsEvent>();

    if (!body.event) {
      return c.json({ error: 'Missing event name' }, 400);
    }

    const event: AnalyticsEvent = {
      event: body.event,
      path: body.path || c.req.header('Referer') || 'unknown',
      userAgent: c.req.header('User-Agent') || 'unknown',
      timestamp: new Date().toISOString(),
    };

    // Store in D1 (fire-and-forget, don't block response)
    c.executionCtx.waitUntil(
      c.env.DB.prepare(
        'INSERT INTO analytics_events (event, path, user_agent, timestamp) VALUES (?, ?, ?, ?)',
      )
        .bind(event.event, event.path, event.userAgent, event.timestamp)
        .run()
        .catch(() => {
          // Silently fail — analytics should never break the app
        }),
    );

    return c.json({ success: true });
  } catch {
    return c.json({ error: 'Invalid event data' }, 400);
  }
});

/**
 * GET /api/analytics/events
 * Admin-only: retrieve recent analytics events.
 */
analyticsRoutes.get('/events', async (c) => {
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!c.env.ADMIN_SECRET || token !== c.env.ADMIN_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM analytics_events ORDER BY timestamp DESC LIMIT 100',
    ).all<AnalyticsEvent & { id: number }>();

    return c.json({ events: results });
  } catch {
    return c.json({ error: 'Failed to fetch events' }, 500);
  }
});

export default analyticsRoutes;
