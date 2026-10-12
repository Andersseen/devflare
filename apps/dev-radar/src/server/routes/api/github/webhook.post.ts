import {
  createError,
  defineEventHandler,
  getHeader,
  readRawBody,
  setResponseStatus,
} from 'h3';
import { db } from '../../../db';
import { runInBackground } from '../../../lib/background';
import { envVar } from '../../../lib/env';
import { createEventStoreSink } from '../../../lib/store/events';
import { runSync } from '../../../lib/sync/run';
import { verifyWebhookSignature } from '../../../lib/webhooks/signature';
import {
  processWebhook,
  WebhookProcessingError,
} from '../../../lib/webhooks/process';

/**
 * POST /api/github/webhook — GitHub App webhooks.
 *
 * Public by necessity, authenticated by signature: the HMAC-SHA256 of the raw
 * body must match `X-Hub-Signature-256` before anything is parsed or stored.
 * Responses are fixed JSON; payloads and the secret are never logged.
 */
export default defineEventHandler(async (event) => {
  const secret = envVar(event.context, 'GITHUB_WEBHOOK_SECRET');
  if (!secret) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Webhook endpoint is not configured',
      data: { code: 'not_configured' },
    });
  }

  const rawBody = (await readRawBody(event, 'utf8')) ?? '';
  const valid = await verifyWebhookSignature(
    secret,
    rawBody,
    getHeader(event, 'x-hub-signature-256'),
  );
  if (!valid) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid signature',
      data: { code: 'invalid_signature' },
    });
  }

  const deliveryId = getHeader(event, 'x-github-delivery');
  const name = getHeader(event, 'x-github-event');
  if (!deliveryId || !name || deliveryId.length > 128) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing GitHub headers',
    });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Body is not JSON' });
  }

  try {
    const outcome = await processWebhook(
      {
        db,
        sink: createEventStoreSink(db),
        scheduleSync: (installationId) =>
          runInBackground(event, () =>
            runSync(event.context, { installationId }),
          ),
      },
      { deliveryId, event: name, payload },
    );
    // 202 for a delivery another worker is still handling; 200 otherwise —
    // duplicates and ignored events are successes, so GitHub stops retrying.
    if (outcome.result === 'in_progress') setResponseStatus(event, 202);
    return outcome;
  } catch (error) {
    if (error instanceof WebhookProcessingError) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Webhook processing failed',
        data: { code: 'processing_failed' },
      });
    }
    throw error;
  }
});
