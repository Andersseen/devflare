import {
  defineEventHandler,
  deleteCookie,
  getCookie,
  getQuery,
  sendRedirect,
} from 'h3';
import {
  AuthorizationDeniedError,
  InvalidStateError,
  ProtocolError,
  type AuthTransaction,
} from '@org/dev-auth-core';
import { getDevAuthClient, safeReturnTo } from '../../../lib/oidc';
import { startSession } from '../../../lib/session';
import { OAUTH_TRANSACTION_COOKIE } from './login';

function readTransaction(raw: string | undefined): AuthTransaction | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AuthTransaction>;
    return parsed.state && parsed.codeVerifier
      ? (parsed as AuthTransaction)
      : null;
  } catch {
    return null;
  }
}

function stringParam(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * GET /api/auth/callback — the redirect URI registered for DevFlare at dev-auth.
 *
 * Exchanges the authorization code for tokens (server to server), reads the
 * identity from the provider's userinfo endpoint, and starts DevFlare's *own*
 * session. From here on DevFlare answers authenticated requests by itself; it
 * never sees the provider's session cookie.
 *
 * Validation (state, nonce, the code exchange, userinfo) is @org/dev-auth-core's
 * job via `handleCallback`; this route only maps its typed errors back to the
 * same login-page redirects it always has.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const transaction = readTransaction(
    getCookie(event, OAUTH_TRANSACTION_COOKIE),
  );

  // One-shot: whatever happens next, this transaction is spent.
  deleteCookie(event, OAUTH_TRANSACTION_COOKIE, { path: '/' });

  const client = getDevAuthClient(event.context);

  try {
    const { identity } = await client.handleCallback(
      {
        code: stringParam(query['code']),
        state: stringParam(query['state']),
        error: stringParam(query['error']),
      },
      transaction,
    );

    await startSession(event, {
      id: identity.subject,
      email: identity.email ?? '',
      name: identity.name || identity.email || 'DevFlare user',
      image: identity.picture ?? null,
    });

    return sendRedirect(event, safeReturnTo(transaction?.returnTo));
  } catch (error) {
    // The provider reports a refusal (unregistered redirect URI, cancelled
    // GitHub consent) on the redirect itself. Surface it on the login page
    // rather than failing with a bare 500.
    if (error instanceof AuthorizationDeniedError) {
      return sendRedirect(
        event,
        `/login?error=${encodeURIComponent(error.code)}`,
      );
    }
    // Either the transaction cookie expired or the state does not match the
    // one this browser started with — the code is not ours to redeem.
    if (error instanceof InvalidStateError) {
      return sendRedirect(event, '/login?error=invalid_state');
    }
    // A mismatched client secret, an expired code, an unreachable provider.
    // The cause is already logged by @org/dev-auth-core; the user gets a login
    // page to retry from rather than a stack trace, and never the provider's
    // own message — those name clients and secrets.
    if (error instanceof ProtocolError) {
      return sendRedirect(event, '/login?error=provider_error');
    }
    throw error;
  }
});
