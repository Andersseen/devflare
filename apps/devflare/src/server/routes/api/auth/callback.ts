import {
  defineEventHandler,
  deleteCookie,
  getCookie,
  getQuery,
  sendRedirect,
} from 'h3';
import {
  exchangeCode,
  fetchUserInfo,
  OidcError,
  resolveOidcConfig,
  safeReturnTo,
  type UserInfo,
} from '../../../lib/oidc';
import { startSession } from '../../../lib/session';
import { OAUTH_TRANSACTION_COOKIE } from './login';

interface Transaction {
  state?: string;
  verifier?: string;
  returnTo?: string;
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
 * GET /api/auth/callback — the redirect URI registered for DevFlare at dev-auth.
 *
 * Exchanges the authorization code for tokens (server to server), reads the
 * identity from the provider's userinfo endpoint, and starts DevFlare's *own*
 * session. From here on DevFlare answers authenticated requests by itself; it
 * never sees the provider's session cookie.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const transaction = readTransaction(
    getCookie(event, OAUTH_TRANSACTION_COOKIE),
  );

  // One-shot: whatever happens next, this transaction is spent.
  deleteCookie(event, OAUTH_TRANSACTION_COOKIE, { path: '/' });

  // The provider reports a refusal (unregistered redirect URI, cancelled GitHub
  // consent) on the redirect itself. Surface it on the login page rather than
  // failing with a bare 500.
  const providerError = query['error'];
  if (typeof providerError === 'string' && providerError) {
    return sendRedirect(
      event,
      `/login?error=${encodeURIComponent(providerError)}`,
    );
  }

  const code = query['code'];
  const state = query['state'];

  if (!transaction || typeof code !== 'string' || state !== transaction.state) {
    // Either the transaction cookie expired or the state does not match the one
    // this browser started with — the code is not ours to redeem.
    return sendRedirect(event, '/login?error=invalid_state');
  }

  const config = resolveOidcConfig(event.context);

  let info: UserInfo;
  try {
    const tokens = await exchangeCode(
      config,
      code,
      transaction.verifier as string,
    );
    info = await fetchUserInfo(config, tokens.access_token);
  } catch (error) {
    // A mismatched client secret, an expired code, an unreachable provider. The
    // cause is already logged; the user gets a login page to retry from rather
    // than a stack trace, and never the provider's own message — those name
    // clients and secrets.
    if (!(error instanceof OidcError)) throw error;
    return sendRedirect(event, '/login?error=provider_error');
  }

  await startSession(event, {
    id: info.sub,
    email: info.email ?? '',
    name: info.name || info.email || 'DevFlare user',
    image: info.picture ?? info.image ?? null,
  });

  return sendRedirect(event, safeReturnTo(transaction.returnTo));
});
