import { createCodeVerifier, createState, codeChallenge } from './crypto';
import { discoverMetadata, type DiscoverOptions } from './discovery';
import {
  AuthorizationDeniedError,
  DevAuthError,
  InvalidStateError,
  ProtocolError,
} from './errors';
import {
  buildAuthorizationUrl,
  exchangeCode,
  fetchUserInfo,
  type NormalizedIdentity,
  type TokenResponse,
} from './protocol';
import { safeReturnTo } from './return-to';

const DEFAULT_SCOPE = 'openid profile email';

export interface DevAuthClientConfig {
  /** Base URL of the provider, e.g. https://auth-devflare.andersseen.dev */
  issuer: string;
  clientId: string;
  /** Confidential clients only; omit for a public client authenticated by
   * PKCE alone. */
  clientSecret?: string;
  /** Must match one of the redirect URIs registered for this client id, byte
   * for byte — the provider compares them with string equality. */
  redirectUri: string;
  scope?: string;
  /** Passed through to discovery; mainly useful for tests. */
  discovery?: DiscoverOptions;
}

/** What a consumer keeps (a cookie, typically) between the redirect to the
 * provider and the callback that completes it. Opaque to the caller. */
export interface AuthTransaction {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
}

export interface AuthorizationRequest {
  url: string;
  transaction: AuthTransaction;
}

/** What a callback route reads off the request — already parsed to strings by
 * the caller's framework of choice, so this SDK never has to understand
 * `URLSearchParams` vs. an h3/Hono query object. */
export interface CallbackParams {
  code?: string;
  state?: string;
  error?: string;
}

export interface CallbackResult {
  identity: NormalizedIdentity;
  tokens: TokenResponse;
}

export interface LogoutOptions {
  /** Must be one of the client's registered post-logout redirect URIs. */
  postLogoutRedirectUri?: string;
}

export interface DevAuthClient {
  /** Provider metadata — discovered and cached, or the conventional
   * dev-auth layout if discovery is unavailable. */
  discover(): ReturnType<typeof discoverMetadata>;
  createAuthorizationRequest(opts?: {
    returnTo?: unknown;
  }): Promise<AuthorizationRequest>;
  /**
   * Validates and completes an authorization response.
   *
   * Throws {@link AuthorizationDeniedError} when the provider reports `error`,
   * {@link InvalidStateError} when the code is missing or `state` does not
   * match the transaction, and {@link ProtocolError} when the token exchange
   * or userinfo call fails.
   */
  handleCallback(
    params: CallbackParams,
    transaction: AuthTransaction | null | undefined,
  ): Promise<CallbackResult>;
  getUserInfo(accessToken: string): Promise<NormalizedIdentity>;
  /** `null` when the provider has no end-session endpoint for this client. */
  logoutUrl(opts?: LogoutOptions): Promise<string | null>;
}

/**
 * Builds a client for one OAuth 2.1 / OIDC consumer of a DevAuth-compatible
 * provider.
 *
 * This is the whole SDK core: it understands the authorization code + PKCE
 * flow, discovery, and normalizing the provider's userinfo response. It does
 * not understand cookies, HTTP frameworks, or how the caller stores its own
 * application session — see the package README's "Session boundary" section.
 */
export function createDevAuthClient(
  config: DevAuthClientConfig,
): DevAuthClient {
  const issuer = config.issuer.replace(/\/$/, '');
  const scope = config.scope ?? DEFAULT_SCOPE;

  const discover = () => discoverMetadata(issuer, config.discovery);

  return {
    discover,

    async createAuthorizationRequest(opts = {}) {
      const metadata = await discover();
      const state = createState();
      const nonce = createState();
      const codeVerifier = createCodeVerifier();
      const challenge = await codeChallenge(codeVerifier);

      const url = buildAuthorizationUrl(metadata.authorization_endpoint, {
        clientId: config.clientId,
        redirectUri: config.redirectUri,
        scope,
        state,
        nonce,
        challenge,
      });

      return {
        url,
        transaction: {
          state,
          nonce,
          codeVerifier,
          returnTo: safeReturnTo(opts.returnTo),
        },
      };
    },

    async handleCallback(params, transaction) {
      if (params.error) {
        throw new AuthorizationDeniedError(params.error);
      }

      if (!transaction || !params.code || params.state !== transaction.state) {
        throw new InvalidStateError(
          'missing authorization code, or the callback state did not match the request that started it',
        );
      }

      const metadata = await discover();

      try {
        const tokens = await exchangeCode({
          tokenEndpoint: metadata.token_endpoint,
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          redirectUri: config.redirectUri,
          code: params.code,
          codeVerifier: transaction.codeVerifier,
        });
        const identity = await fetchUserInfo(
          metadata.userinfo_endpoint,
          tokens.access_token,
        );
        return { identity, tokens };
      } catch (error) {
        if (error instanceof DevAuthError) throw error;
        throw new ProtocolError('token exchange or userinfo request failed');
      }
    },

    async getUserInfo(accessToken) {
      const metadata = await discover();
      return fetchUserInfo(metadata.userinfo_endpoint, accessToken);
    },

    async logoutUrl(opts = {}) {
      const metadata = await discover();
      if (!metadata.end_session_endpoint) return null;

      const url = new URL(metadata.end_session_endpoint);
      if (opts.postLogoutRedirectUri) {
        url.searchParams.set(
          'post_logout_redirect_uri',
          opts.postLogoutRedirectUri,
        );
      }
      return url.toString();
    },
  };
}
