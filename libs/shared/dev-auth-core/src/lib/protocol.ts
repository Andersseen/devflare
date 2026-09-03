import { ProtocolError } from './errors';

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  id_token?: string;
  refresh_token?: string;
  scope?: string;
}

/** Identity as this SDK hands it back — provider-shape details (`sub` vs
 * `image` vs `picture`) are normalized away here, once. */
export interface NormalizedIdentity {
  subject: string;
  email?: string;
  name?: string;
  picture?: string;
}

export interface AuthorizationUrlParams {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  nonce: string;
  challenge: string;
}

export function buildAuthorizationUrl(
  authorizationEndpoint: string,
  params: AuthorizationUrlParams,
): string {
  const url = new URL(authorizationEndpoint);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    scope: params.scope,
    state: params.state,
    nonce: params.nonce,
    code_challenge: params.challenge,
    code_challenge_method: 'S256',
  }).toString();
  return url.toString();
}

export interface ExchangeCodeParams {
  tokenEndpoint: string;
  clientId: string;
  /** Omitted for public clients, authenticated by PKCE alone. */
  clientSecret?: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}

/** Back-channel code exchange: server to server, so tokens never touch the
 * browser. */
export async function exchangeCode(
  params: ExchangeCodeParams,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    code_verifier: params.codeVerifier,
  });
  if (params.clientSecret) body.set('client_secret', params.clientSecret);

  const response = await fetch(params.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    // The provider's error body can name the client or the secret; log it for
    // the operator but never forward it to the caller.
    console.error(
      `[dev-auth-core] token exchange failed (${response.status}): ${await response.text()}`,
    );
    throw new ProtocolError(`token exchange failed with ${response.status}`);
  }

  return (await response.json()) as TokenResponse;
}

interface RawUserInfo {
  sub?: string;
  email?: string;
  name?: string;
  picture?: string;
  image?: string;
}

/** Identity is read from the userinfo endpoint rather than decoded from the ID
 * token: one authenticated call against the issuer, so there is no signature
 * to verify and no key to keep in sync. */
export async function fetchUserInfo(
  userinfoEndpoint: string,
  accessToken: string,
): Promise<NormalizedIdentity> {
  const response = await fetch(userinfoEndpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    console.error(
      `[dev-auth-core] userinfo failed (${response.status}): ${await response.text()}`,
    );
    throw new ProtocolError(`userinfo failed with ${response.status}`);
  }

  const info = (await response.json()) as RawUserInfo;
  if (!info?.sub) {
    throw new ProtocolError('provider returned no subject');
  }

  return {
    subject: info.sub,
    email: info.email,
    name: info.name,
    picture: info.picture ?? info.image,
  };
}
