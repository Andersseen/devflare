import { Hono } from 'hono';
import type { Env } from '../index';

const setupRoutes = new Hono<{ Bindings: Env }>();

/**
 * POST /api/setup/d1
 * Creates a D1 database via Cloudflare API using the user's credentials.
 * We do NOT store the API token - it's only used for this single request.
 */
setupRoutes.post('/d1', async (c) => {
  try {
    const body = await c.req.json<{
      accountId: string;
      apiToken: string;
      dbName: string;
    }>();
    const { accountId, apiToken, dbName } = body;

    if (!accountId || !apiToken || !dbName) {
      return c.json(
        { success: false, error: 'Missing accountId, apiToken, or dbName' },
        400,
      );
    }

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: dbName }),
      },
    );

    const data = (await response.json()) as {
      success: boolean;
      result?: { uuid: string; name: string; version: string };
      errors?: Array<{ message: string }>;
    };

    if (!response.ok || !data.success) {
      const errors =
        data.errors?.map((e: { message: string }) => e.message).join(', ') ||
        'Cloudflare API error';
      return c.json({ success: false, error: errors }, 400);
    }

    if (!data.result) {
      return c.json(
        { success: false, error: 'Invalid response from Cloudflare API' },
        500,
      );
    }

    return c.json({
      success: true,
      result: {
        uuid: data.result.uuid,
        name: data.result.name,
        version: data.result.version,
      },
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
 * GET /api/setup/d1
 * List D1 databases for the account (optional helper).
 */
setupRoutes.get('/d1', async (c) => {
  try {
    const accountId = c.req.query('accountId');
    const apiToken = c.req.query('apiToken');

    if (!accountId || !apiToken) {
      return c.json(
        { success: false, error: 'Missing accountId or apiToken' },
        400,
      );
    }

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database`,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
        },
      },
    );

    const data = (await response.json()) as {
      success: boolean;
      result?: unknown;
      errors?: Array<{ message: string }>;
    };

    if (!response.ok || !data.success) {
      const errors =
        data.errors?.map((e: { message: string }) => e.message).join(', ') ||
        'Cloudflare API error';
      return c.json({ success: false, error: errors }, 400);
    }

    return c.json({ success: true, result: data.result });
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

export default setupRoutes;
