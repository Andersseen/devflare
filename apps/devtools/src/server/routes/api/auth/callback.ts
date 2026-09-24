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
} from '@dev-auth/core';
import { clientKey, enforceRateLimit } from '../../../lib/http';
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

/** Sends the browser back to where sign-in started, with a reason code the
 * connected page turns into copy. Never the provider's own message. */
function backWithError(returnTo: string, code: string): string {
  const separator = returnTo.includes('?') ? '&' : '?';
  return `${returnTo}${separator}auth_error=${encodeURIComponent(code)}`;
}

/**
 * GET /api/auth/callback — DevTools' registered redirect URI at DevAuth.
 *
 * @dev-auth/core validates state, exchanges the code with PKCE + the client
 * secret (server to server) and reads userinfo. DevTools then starts its own
 * session. Tokens are not stored and never reach the browser.
 */
export default defineEventHandler(async (event) => {
  await enforceRateLimit(event, 'AUTH_RATE_LIMITER', clientKey(event));

  const query = getQuery(event);
  const transaction = readTransaction(
    getCookie(event, OAUTH_TRANSACTION_COOKIE),
  );
  // One-shot: whatever happens next, this transaction is spent.
  deleteCookie(event, OAUTH_TRANSACTION_COOKIE, { path: '/api/auth' });

  const returnTo = safeReturnTo(transaction?.returnTo);
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
      name: identity.name || identity.email || 'DevTools user',
      image: identity.picture ?? null,
    });

    return sendRedirect(event, returnTo);
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) {
      return sendRedirect(event, backWithError(returnTo, error.code));
    }
    if (error instanceof InvalidStateError) {
      return sendRedirect(event, backWithError(returnTo, 'invalid_state'));
    }
    if (error instanceof ProtocolError) {
      return sendRedirect(event, backWithError(returnTo, 'provider_error'));
    }
    throw error;
  }
});
