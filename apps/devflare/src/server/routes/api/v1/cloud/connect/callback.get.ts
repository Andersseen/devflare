import {
  defineEventHandler,
  deleteCookie,
  getCookie,
  getQuery,
  sendRedirect,
} from 'h3';
import { requireCloudAdmin } from '../../../../../lib/cloud-admin';
import { clearCloudflareCache } from '../../../../../lib/cloudflare';
import { saveConnection } from '../../../../../lib/cloudflare-connection';
import {
  CloudflareOAuthError,
  exchangeCode,
  preferredAccountId,
  resolveCloudflareOAuthConfig,
  resolveConnectedAccount,
} from '../../../../../lib/cloudflare-oauth';
import { CLOUD_CONNECT_COOKIE } from './start.get';

interface Transaction {
  state?: string;
  verifier?: string;
}

function readTransaction(raw: string | undefined): Transaction | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Transaction;
    return parsed.state && parsed.verifier ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * GET /api/v1/cloud/connect/callback — the redirect URI registered for DevFlare
 * at Cloudflare.
 *
 * Exchanges the code server to server, so the tokens never touch the browser,
 * resolves which account the grant covers, and stores it sealed. Every outcome
 * ends as a redirect to /cloud with a short reason code: this is a navigation,
 * and an owner returning from a consent screen should land on the page they
 * started from, not on a JSON error.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const transaction = readTransaction(getCookie(event, CLOUD_CONNECT_COOKIE));

  // One-shot: whatever happens next, this transaction is spent.
  deleteCookie(event, CLOUD_CONNECT_COOKIE, { path: '/' });

  // Re-checked on the way back, not merely on the way out: the cookie proves
  // the browser started this, never that the person is still an administrator.
  const user = await requireCloudAdmin(event);

  // A refusal — consent declined, an unregistered redirect URI — arrives on the
  // redirect itself rather than as an HTTP error.
  const providerError = query['error'];
  if (typeof providerError === 'string' && providerError) {
    return sendRedirect(
      event,
      `/cloud?connect=${encodeURIComponent(providerError)}`,
    );
  }

  const code = query['code'];
  const state = query['state'];

  if (!transaction || typeof code !== 'string' || state !== transaction.state) {
    return sendRedirect(event, '/cloud?connect=invalid_state');
  }

  const config = resolveCloudflareOAuthConfig(event.context);
  if (!config) return sendRedirect(event, '/cloud?connect=not_configured');

  try {
    const tokens = await exchangeCode(
      config,
      code,
      transaction.verifier as string,
    );
    const account = await resolveConnectedAccount(
      tokens,
      preferredAccountId(event.context),
    );

    await saveConnection(event.context, { tokens, account, userId: user.id });
  } catch (error) {
    // The cause is already logged; the browser gets a code it can render, never
    // the upstream message — those quote client ids and secrets.
    if (!(error instanceof CloudflareOAuthError)) throw error;
    return sendRedirect(event, '/cloud?connect=exchange_failed');
  }

  // The memo may hold listings fetched with the previous credential, which for
  // a first connection means the empty answers of an unconfigured server.
  clearCloudflareCache();

  return sendRedirect(event, '/cloud?connect=ok');
});
