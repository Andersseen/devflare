import { createError, defineEventHandler, readBody } from 'h3';
import { requireCloudAdmin } from '../../../../../lib/cloud-admin';
import {
  oauthClientView,
  OAuthClientError,
  saveOAuthClient,
} from '../../../../../lib/cloudflare-oauth-client';

interface Body {
  clientId?: unknown;
  clientSecret?: unknown;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * PUT /api/v1/cloud/oauth-client — store the client an administrator entered.
 *
 * The secret is write-only, like dev-auth's GitHub secret: it is sealed on the
 * way in and never comes back out, so an empty one means "keep the current
 * one" rather than "clear it".
 *
 * Storing it needs SECRET_ENCRYPTION_KEY. Without it this answers 503 rather
 * than writing a credential in the clear — the refusal is the feature.
 */
export default defineEventHandler(async (event) => {
  const user = await requireCloudAdmin(event);
  const body = (await readBody<Body>(event)) ?? {};

  const clientId = text(body.clientId);
  if (!clientId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'clientId is required',
    });
  }

  try {
    await saveOAuthClient(event.context, {
      clientId,
      clientSecret: text(body.clientSecret) || null,
      userId: user.id,
    });
  } catch (error) {
    if (!(error instanceof OAuthClientError)) throw error;

    throw createError({
      // "no encryption key" is the server's state, not the caller's mistake.
      statusCode: error.message.includes('SECRET_ENCRYPTION_KEY') ? 503 : 400,
      statusMessage: error.message,
      data: { error: error.message },
    });
  }

  // Answered with the same view the page loaded, so the card can render the
  // result — including which source now wins — without a second request.
  return oauthClientView(event.context);
});
