import { createError, defineEventHandler, sendRedirect, setCookie } from 'h3';
import { requireCloudAdmin } from '../../../../../lib/cloud-admin';
import { encryptionKey } from '../../../../../lib/cloudflare-connection';
import {
  authorizationUrl,
  codeChallenge,
  createCodeVerifier,
  createState,
  resolveCloudflareOAuthConfig,
} from '../../../../../lib/cloudflare-oauth';
import { isSecureRequest } from '../../../../../lib/session';

/**
 * GET /api/v1/cloud/connect/start — begins the OAuth flow at Cloudflare.
 *
 * A top-level navigation rather than a fetch, because it ends on Cloudflare's
 * consent screen. The state and the PKCE verifier stay in a cookie on
 * DevFlare's own domain: the verifier proves at the token endpoint that the
 * code came back to the browser that asked for it, and the state is compared on
 * return so a code cannot be injected from elsewhere.
 *
 * Admin-gated like every other Cloud route — this grants access to the whole
 * account, so it is emphatically not something a signed-in user may start.
 */
export const CLOUD_CONNECT_COOKIE = 'df_cf_oauth_tx';

export default defineEventHandler(async (event) => {
  await requireCloudAdmin(event);

  const config = resolveCloudflareOAuthConfig(event.context);
  if (!config) {
    throw createError({
      statusCode: 503,
      statusMessage: 'This server has no Cloudflare OAuth client configured',
    });
  }

  // Checked here rather than at the callback so a missing key costs a refusal
  // before the consent screen, not after the owner has already approved.
  if (!encryptionKey(event.context)) {
    throw createError({
      statusCode: 503,
      statusMessage:
        'SECRET_ENCRYPTION_KEY is not set, so a connection could not be stored',
    });
  }

  const state = createState();
  const verifier = createCodeVerifier();

  setCookie(event, CLOUD_CONNECT_COOKIE, JSON.stringify({ state, verifier }), {
    httpOnly: true,
    // The callback is a top-level navigation from Cloudflare's origin, so
    // Strict would withhold this and every attempt would fail state validation.
    sameSite: 'lax',
    secure: isSecureRequest(event),
    path: '/',
    maxAge: 60 * 10,
  });

  return sendRedirect(
    event,
    authorizationUrl(config, {
      state,
      challenge: await codeChallenge(verifier),
    }),
  );
});
