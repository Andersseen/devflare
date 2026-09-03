/**
 * Base of every error this SDK throws. A consumer that only cares "did DevAuth
 * fail" can catch this one type instead of enumerating every variant below.
 */
export class DevAuthError extends Error {}

/**
 * The provider itself refused or cancelled the request — the user declined
 * consent, or `error` came back on the redirect for some other reason. `code`
 * is the OAuth `error` parameter, safe to show on a login page.
 */
export class AuthorizationDeniedError extends DevAuthError {
  constructor(public readonly code: string) {
    super(`authorization denied: ${code}`);
  }
}

/**
 * The callback arrived with no authorization code, or its `state` did not
 * match the one this request started with — an expired, replayed, or forged
 * callback. Never carries the state values themselves.
 */
export class InvalidStateError extends DevAuthError {}

/**
 * The code exchange or the userinfo call failed against the provider. The
 * response that caused it is logged for the operator; this error's message
 * never repeats it, so it is always safe to show a user.
 */
export class ProtocolError extends DevAuthError {}

/**
 * Discovery metadata could not be trusted: unreachable, malformed, or its
 * `issuer` did not match the configured one.
 */
export class DiscoveryError extends DevAuthError {}
