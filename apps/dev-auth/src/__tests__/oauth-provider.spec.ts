import { describe, it, expect, beforeEach } from 'vitest';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { createAuthOptions, resetClientRegistryCache } from '../auth.config';
import type { Env } from '../index';

/**
 * Exercises the provider role against a real better-auth instance built from the
 * *same* `createAuthOptions` the Worker uses, so the OAuth behaviour under test
 * is the deployed behaviour. Only the database differs: in-memory instead of D1,
 * which is the one part that cannot run outside Workers.
 */

const BASE_URL = 'https://auth.test';
const DEVFLARE_REDIRECT = 'https://devflare.test/api/auth/callback';
const IMAGINARYX_REDIRECT = 'https://imaginaryx.test/auth/callback';

const CLIENTS = JSON.stringify([
  {
    clientId: 'devflare',
    name: 'DevFlare',
    type: 'web',
    redirectURIs: [DEVFLARE_REDIRECT],
  },
  {
    clientId: 'imaginaryx',
    name: 'Imaginaryx',
    type: 'web',
    redirectURIs: [IMAGINARYX_REDIRECT],
  },
]);

const DEVFLARE_SECRET = 'devflare-client-secret-with-entropy';
const IMAGINARYX_SECRET = 'imaginaryx-client-secret-with-entropy';

const CLIENT_SECRETS = JSON.stringify({
  devflare: DEVFLARE_SECRET,
  imaginaryx: IMAGINARYX_SECRET,
});

// The PKCE verifier/challenge pair from RFC 7636 appendix B, so the test asserts
// against the spec's own S256 vector instead of recomputing the transform it is
// checking (and cannot agree with a bug in its own copy of it).
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const WRONG_VERIFIER = 'M25iVXpKU3puUjFaYWg3T1NDTDQtcW1ROUY5YXlwalNfSk';

function createTestEnv(overrides: Partial<Env> = {}): Env {
  return {
    // Replaced by the memory adapter below; the type demands a binding.
    DB: undefined as unknown as D1Database,
    BETTER_AUTH_URL: BASE_URL,
    BETTER_AUTH_SECRET: 'test-secret-at-least-32-characters-long',
    GITHUB_CLIENT_ID: 'github-test-client-id',
    GITHUB_CLIENT_SECRET: 'github-test-client-secret',
    OAUTH_CLIENTS: CLIENTS,
    OAUTH_CLIENT_SECRETS: CLIENT_SECRETS,
    ...overrides,
  };
}

/** Every model better-auth (core + oauth + jwt plugins) touches. */
function emptyDb(): Record<string, unknown[]> {
  return {
    user: [],
    session: [],
    account: [],
    verification: [],
    oauthClient: [],
    oauthAccessToken: [],
    oauthRefreshToken: [],
    oauthConsent: [],
    jwks: [],
  };
}

async function createTestAuth(env: Env = createTestEnv()) {
  // The registry is memoised per configuration in auth.config.ts; a spec that
  // swaps OAUTH_CLIENTS between cases has to drop that memo or it gets the
  // previous case's clients.
  resetClientRegistryCache();
  return betterAuth(await createAuthOptions(env, memoryAdapter(emptyDb())));
}

type Auth = Awaited<ReturnType<typeof createTestAuth>>;

/** Collapses a response's Set-Cookie headers into a Cookie request header. */
function cookiesFrom(response: Response): string {
  const raw = response.headers.getSetCookie?.() ?? [];
  return raw.map((cookie) => cookie.split(';')[0]).join('; ');
}

async function signUp(auth: Auth, email = 'owner@devflare.test') {
  const response = await auth.handler(
    new Request(`${BASE_URL}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'TestPass123',
        name: 'Test Owner',
      }),
    }),
  );
  expect(response.status).toBe(200);
  return { cookie: cookiesFrom(response) };
}

function authorizeRequest(
  params: Record<string, string>,
  cookie?: string,
): Request {
  const url = new URL(`${BASE_URL}/api/auth/oauth2/authorize`);
  url.search = new URLSearchParams({
    response_type: 'code',
    scope: 'openid profile email',
    code_challenge: CHALLENGE,
    code_challenge_method: 'S256',
    ...params,
  }).toString();

  return new Request(url, {
    headers: cookie ? { cookie } : {},
  });
}

/** Runs an authorization request and returns the URL the browser is sent to. */
async function authorize(
  auth: Auth,
  params: Record<string, string>,
  cookie?: string,
): Promise<{ status: number; location: string | null }> {
  const response = await auth.handler(authorizeRequest(params, cookie));
  return {
    status: response.status,
    location: response.headers.get('location'),
  };
}

async function exchangeCode(
  auth: Auth,
  body: Record<string, string>,
): Promise<Response> {
  return auth.handler(
    new Request(`${BASE_URL}/api/auth/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    }),
  );
}

function decodeJwtPart(token: string, index: 0 | 1): Record<string, unknown> {
  const part = token.split('.')[index];
  const padded = part.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(padded)) as Record<string, unknown>;
}

describe('dev-auth as an OAuth 2.1 / OIDC provider', () => {
  let auth: Auth;

  beforeEach(async () => {
    auth = await createTestAuth();
  });

  describe('service and existing authentication methods', () => {
    it('starts with the provider plugins mounted', () => {
      expect(auth.handler).toBeTypeOf('function');
      expect(auth.api.getSession).toBeTypeOf('function');
    });

    it('still signs users in with email and password', async () => {
      await signUp(auth);

      const response = await auth.handler(
        new Request(`${BASE_URL}/api/auth/sign-in/email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'owner@devflare.test',
            password: 'TestPass123',
          }),
        }),
      );

      expect(response.status).toBe(200);
      const session = await auth.api.getSession({
        headers: new Headers({ cookie: cookiesFrom(response) }),
      });
      expect(session?.user.email).toBe('owner@devflare.test');
    });

    it('keeps GitHub sign-in configured', async () => {
      const response = await auth.handler(
        new Request(`${BASE_URL}/api/auth/sign-in/social`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: 'github' }),
        }),
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as { url?: string };
      expect(body.url).toContain('github.com/login/oauth/authorize');
      expect(body.url).toContain('client_id=github-test-client-id');
    });

    it('enforces the sign-up allow-list on every account creation path', async () => {
      const gated = await createTestAuth(
        createTestEnv({ SIGNUP_ALLOWLIST: 'invited@devflare.test' }),
      );

      const refused = await gated.handler(
        new Request(`${BASE_URL}/api/auth/sign-up/email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'stranger@devflare.test',
            password: 'TestPass123',
            name: 'Stranger',
          }),
        }),
      );
      expect(refused.status).toBe(403);

      const allowed = await gated.handler(
        new Request(`${BASE_URL}/api/auth/sign-up/email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'invited@devflare.test',
            password: 'TestPass123',
            name: 'Invited',
          }),
        }),
      );
      expect(allowed.status).toBe(200);
    });
  });

  describe('discovery', () => {
    it('publishes the endpoints and issuer a client needs', async () => {
      const metadata = (await auth.api.getOpenIdConfig()) as Record<
        string,
        unknown
      >;

      expect(metadata['issuer']).toBe(BASE_URL);
      expect(metadata['authorization_endpoint']).toBe(
        `${BASE_URL}/api/auth/oauth2/authorize`,
      );
      expect(metadata['token_endpoint']).toBe(
        `${BASE_URL}/api/auth/oauth2/token`,
      );
      expect(metadata['userinfo_endpoint']).toBe(
        `${BASE_URL}/api/auth/oauth2/userinfo`,
      );
      expect(metadata['jwks_uri']).toBe(`${BASE_URL}/api/auth/jwks`);
      expect(metadata['code_challenge_methods_supported']).toEqual(['S256']);
      // Derived from the JWT plugin's key pair rather than restated: the old
      // plugin hardcoded RS256/EdDSA here and needed a manual override.
      expect(metadata['id_token_signing_alg_values_supported']).toEqual([
        'ES256',
      ]);
      expect(metadata['response_types_supported']).toEqual(['code']);
      expect(metadata['grant_types_supported']).toEqual([
        'authorization_code',
        'refresh_token',
      ]);
    });

    it('advertises no registration endpoint', async () => {
      const metadata = (await auth.api.getOpenIdConfig()) as Record<
        string,
        unknown
      >;

      // Dynamic registration is off, so advertising an endpoint for it would
      // only send clients somewhere that refuses them.
      expect(metadata['registration_endpoint']).toBeUndefined();
    });

    it('publishes OAuth authorization-server metadata as well', async () => {
      const metadata = (await auth.api.getOAuthServerConfig()) as Record<
        string,
        unknown
      >;

      expect(metadata['issuer']).toBe(BASE_URL);
      expect(metadata['revocation_endpoint']).toBe(
        `${BASE_URL}/api/auth/oauth2/revoke`,
      );
      expect(metadata['introspection_endpoint']).toBe(
        `${BASE_URL}/api/auth/oauth2/introspect`,
      );
      expect(metadata['token_endpoint_auth_methods_supported']).not.toContain(
        'none',
      );
    });
  });

  describe('starting an authorization flow', () => {
    it('sends an unauthenticated user to the login page, keeping the request', async () => {
      const { status, location } = await authorize(auth, {
        client_id: 'devflare',
        redirect_uri: DEVFLARE_REDIRECT,
        state: 'state-1',
      });

      expect(status).toBe(302);
      expect(location).toContain('/login?');
      // The login page needs these to carry the flow to /signup and back, and
      // the signature is what lets the provider trust them on the way back.
      expect(location).toContain('client_id=devflare');
      expect(location).toContain('state-1');
      expect(location).toContain('sig=');
    });

    it('returns an authorization code to a registered redirect URI', async () => {
      const { cookie } = await signUp(auth);

      const { status, location } = await authorize(
        auth,
        {
          client_id: 'devflare',
          redirect_uri: DEVFLARE_REDIRECT,
          state: 'state-1',
        },
        cookie,
      );

      expect(status).toBe(302);
      const redirect = new URL(location as string);
      expect(`${redirect.origin}${redirect.pathname}`).toBe(DEVFLARE_REDIRECT);
      expect(redirect.searchParams.get('state')).toBe('state-1');
      expect(redirect.searchParams.get('code')).toBeTruthy();
      // RFC 9207: lets a client detect a code delivered by the wrong issuer.
      expect(redirect.searchParams.get('iss')).toBe(BASE_URL);
    });

    it('requires PKCE', async () => {
      const { cookie } = await signUp(auth);

      const response = await auth.handler(
        new Request(
          `${BASE_URL}/api/auth/oauth2/authorize?${new URLSearchParams({
            response_type: 'code',
            client_id: 'devflare',
            redirect_uri: DEVFLARE_REDIRECT,
            scope: 'openid',
            state: 'state-1',
          })}`,
          { headers: { cookie } },
        ),
      );

      const location = response.headers.get('location') as string;
      expect(location).toContain('error=invalid_request');
      expect(location.toLowerCase()).toContain('pkce');
    });

    it('rejects the plain code challenge method', async () => {
      const { cookie } = await signUp(auth);

      const response = await auth.handler(
        new Request(
          `${BASE_URL}/api/auth/oauth2/authorize?${new URLSearchParams({
            response_type: 'code',
            client_id: 'devflare',
            redirect_uri: DEVFLARE_REDIRECT,
            scope: 'openid',
            state: 'state-1',
            code_challenge: VERIFIER,
            code_challenge_method: 'plain',
          })}`,
          { headers: { cookie } },
        ),
      );

      // Refused outright rather than redirected with an error: the provider only
      // accepts `S256`, so `plain` never reaches the flow at all.
      expect(response.status).toBe(400);
      expect(response.headers.get('location')).toBeNull();
      expect(await response.text()).toContain('code_challenge_method');
    });
  });

  describe('redirect URI validation', () => {
    it('refuses a redirect URI that is not registered', async () => {
      const { cookie } = await signUp(auth);

      const { location } = await authorize(
        auth,
        {
          client_id: 'devflare',
          redirect_uri: 'https://attacker.test/callback',
          state: 'state-1',
        },
        cookie,
      );

      // Never reported on the URI the caller supplied — that is the whole point.
      expect(location).not.toContain('attacker.test');
    });

    it.each([
      ['a path the client did not register', 'https://devflare.test/evil'],
      [
        'a lookalike host',
        'https://devflare.test.attacker.test/api/auth/callback',
      ],
      [
        'an extra query string',
        `${DEVFLARE_REDIRECT}?next=https://attacker.test`,
      ],
      ['a trailing slash', `${DEVFLARE_REDIRECT}/`],
    ])('refuses %s', async (_label, redirectUri) => {
      const { cookie } = await signUp(auth);

      const { location } = await authorize(
        auth,
        {
          client_id: 'devflare',
          redirect_uri: redirectUri,
          state: 'state-1',
        },
        cookie,
      );

      if (location) {
        expect(location).not.toContain('code=');
      }
    });

    it('refuses one client using another client redirect URI', async () => {
      const { cookie } = await signUp(auth);

      const { location } = await authorize(
        auth,
        {
          client_id: 'devflare',
          redirect_uri: IMAGINARYX_REDIRECT,
          state: 'state-1',
        },
        cookie,
      );

      if (location) {
        expect(location).not.toContain('code=');
        expect(location).not.toContain('imaginaryx.test');
      }
    });

    it('refuses an unregistered client id', async () => {
      const { cookie } = await signUp(auth);

      const { location } = await authorize(
        auth,
        {
          client_id: 'not-registered',
          redirect_uri: DEVFLARE_REDIRECT,
          state: 'state-1',
        },
        cookie,
      );

      // Reported on the provider's own error page, never on a URI supplied by
      // the caller — an unknown client has no vetted place to be sent back to.
      expect(location).toContain('/login');
      expect(location).toContain('error=invalid_client');
    });
  });

  describe('token exchange', () => {
    async function codeFor(client: 'devflare' | 'imaginaryx', scope?: string) {
      const { cookie } = await signUp(auth);
      const { location } = await authorize(
        auth,
        {
          client_id: client,
          redirect_uri:
            client === 'devflare' ? DEVFLARE_REDIRECT : IMAGINARYX_REDIRECT,
          state: 'state-1',
          ...(scope ? { scope } : {}),
        },
        cookie,
      );
      return new URL(location as string).searchParams.get('code') as string;
    }

    it('exchanges a code for tokens and identity', async () => {
      const code = await codeFor('devflare');

      const response = await exchangeCode(auth, {
        grant_type: 'authorization_code',
        code,
        redirect_uri: DEVFLARE_REDIRECT,
        client_id: 'devflare',
        client_secret: DEVFLARE_SECRET,
        code_verifier: VERIFIER,
      });

      expect(response.status).toBe(200);
      const tokens = (await response.json()) as {
        access_token: string;
        id_token: string;
        token_type: string;
      };
      expect(tokens.token_type).toBe('Bearer');
      expect(tokens.access_token).toBeTruthy();

      // ID token: asymmetrically signed, so a consumer can verify it against
      // /api/auth/jwks without sharing a secret with this service.
      const header = decodeJwtPart(tokens.id_token, 0);
      expect(header['alg']).toBe('ES256');
      expect(header['kid']).toBeTruthy();
      const claims = decodeJwtPart(tokens.id_token, 1);
      expect(claims['iss']).toBe(BASE_URL);
      expect(claims['aud']).toBe('devflare');
      expect(claims['sub']).toBeTruthy();
      expect(claims['email']).toBe('owner@devflare.test');

      const userinfo = await auth.handler(
        new Request(`${BASE_URL}/api/auth/oauth2/userinfo`, {
          headers: { authorization: `Bearer ${tokens.access_token}` },
        }),
      );
      expect(userinfo.status).toBe(200);
      const identity = (await userinfo.json()) as Record<string, unknown>;
      expect(identity['sub']).toBe(claims['sub']);
      expect(identity['email']).toBe('owner@devflare.test');
    });

    it('carries a nonce from the authorization request into the ID token', async () => {
      const { cookie } = await signUp(auth);
      const { location } = await authorize(
        auth,
        {
          client_id: 'devflare',
          redirect_uri: DEVFLARE_REDIRECT,
          state: 'state-1',
          nonce: 'nonce-abc',
        },
        cookie,
      );

      const response = await exchangeCode(auth, {
        grant_type: 'authorization_code',
        code: new URL(location as string).searchParams.get('code') as string,
        redirect_uri: DEVFLARE_REDIRECT,
        client_id: 'devflare',
        client_secret: DEVFLARE_SECRET,
        code_verifier: VERIFIER,
      });

      const tokens = (await response.json()) as { id_token: string };
      expect(decodeJwtPart(tokens.id_token, 1)['nonce']).toBe('nonce-abc');
    });

    it('publishes the verification key at the advertised JWKS endpoint', async () => {
      // Signing has to happen first — the key pair is created on demand.
      const code = await codeFor('devflare');
      await exchangeCode(auth, {
        grant_type: 'authorization_code',
        code,
        redirect_uri: DEVFLARE_REDIRECT,
        client_id: 'devflare',
        client_secret: DEVFLARE_SECRET,
        code_verifier: VERIFIER,
      });

      const response = await auth.handler(
        new Request(`${BASE_URL}/api/auth/jwks`),
      );
      expect(response.status).toBe(200);
      const { keys } = (await response.json()) as {
        keys: Array<Record<string, unknown>>;
      };
      expect(keys.length).toBeGreaterThan(0);
      expect(keys[0]['crv']).toBe('P-256');
      // Public half only: a private key here would defeat the point.
      expect(keys[0]['d']).toBeUndefined();
    });

    it('rejects the wrong client secret', async () => {
      const code = await codeFor('devflare');

      const response = await exchangeCode(auth, {
        grant_type: 'authorization_code',
        code,
        redirect_uri: DEVFLARE_REDIRECT,
        client_id: 'devflare',
        client_secret: 'not-the-secret',
        code_verifier: VERIFIER,
      });

      expect(response.ok).toBe(false);
    });

    it('rejects a missing client secret from a confidential client', async () => {
      const code = await codeFor('devflare');

      const response = await exchangeCode(auth, {
        grant_type: 'authorization_code',
        code,
        redirect_uri: DEVFLARE_REDIRECT,
        client_id: 'devflare',
        code_verifier: VERIFIER,
      });

      expect(response.ok).toBe(false);
    });

    it('accepts client_secret_basic as well as client_secret_post', async () => {
      const code = await codeFor('devflare');

      const response = await auth.handler(
        new Request(`${BASE_URL}/api/auth/oauth2/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            authorization: `Basic ${btoa(`devflare:${DEVFLARE_SECRET}`)}`,
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: DEVFLARE_REDIRECT,
            code_verifier: VERIFIER,
          }),
        }),
      );

      expect(response.status).toBe(200);
    });

    it('rejects a mismatched PKCE verifier', async () => {
      const code = await codeFor('devflare');

      const response = await exchangeCode(auth, {
        grant_type: 'authorization_code',
        code,
        redirect_uri: DEVFLARE_REDIRECT,
        client_id: 'devflare',
        client_secret: DEVFLARE_SECRET,
        code_verifier: WRONG_VERIFIER,
      });

      expect(response.ok).toBe(false);
    });

    it('rejects a missing PKCE verifier', async () => {
      const code = await codeFor('devflare');

      const response = await exchangeCode(auth, {
        grant_type: 'authorization_code',
        code,
        redirect_uri: DEVFLARE_REDIRECT,
        client_id: 'devflare',
        client_secret: DEVFLARE_SECRET,
      });

      expect(response.ok).toBe(false);
    });

    it('rejects a redirect_uri that differs from the one in the request', async () => {
      const code = await codeFor('devflare');

      const response = await exchangeCode(auth, {
        grant_type: 'authorization_code',
        code,
        redirect_uri: IMAGINARYX_REDIRECT,
        client_id: 'devflare',
        client_secret: DEVFLARE_SECRET,
        code_verifier: VERIFIER,
      });

      expect(response.ok).toBe(false);
    });

    it('will not let one client redeem another client code', async () => {
      const code = await codeFor('devflare');

      const response = await exchangeCode(auth, {
        grant_type: 'authorization_code',
        code,
        redirect_uri: IMAGINARYX_REDIRECT,
        client_id: 'imaginaryx',
        client_secret: IMAGINARYX_SECRET,
        code_verifier: VERIFIER,
      });

      expect(response.ok).toBe(false);
    });

    it('spends a code only once', async () => {
      const code = await codeFor('devflare');
      const body = {
        grant_type: 'authorization_code',
        code,
        redirect_uri: DEVFLARE_REDIRECT,
        client_id: 'devflare',
        client_secret: DEVFLARE_SECRET,
        code_verifier: VERIFIER,
      };

      expect((await exchangeCode(auth, body)).status).toBe(200);
      expect((await exchangeCode(auth, body)).ok).toBe(false);
    });

    it('rejects a code that was never issued', async () => {
      const response = await exchangeCode(auth, {
        grant_type: 'authorization_code',
        code: 'not-a-real-code',
        redirect_uri: DEVFLARE_REDIRECT,
        client_id: 'devflare',
        client_secret: DEVFLARE_SECRET,
        code_verifier: VERIFIER,
      });

      expect(response.ok).toBe(false);
    });
  });

  describe('token lifecycle', () => {
    async function tokensFor(scope: string) {
      const { cookie } = await signUp(auth);
      const { location } = await authorize(
        auth,
        {
          client_id: 'devflare',
          redirect_uri: DEVFLARE_REDIRECT,
          state: 'state-1',
          scope,
        },
        cookie,
      );

      const response = await exchangeCode(auth, {
        grant_type: 'authorization_code',
        code: new URL(location as string).searchParams.get('code') as string,
        redirect_uri: DEVFLARE_REDIRECT,
        client_id: 'devflare',
        client_secret: DEVFLARE_SECRET,
        code_verifier: VERIFIER,
      });
      expect(response.status).toBe(200);

      return (await response.json()) as {
        access_token: string;
        refresh_token?: string;
      };
    }

    it('issues a refresh token when offline_access is requested', async () => {
      const tokens = await tokensFor('openid profile email offline_access');
      expect(tokens.refresh_token).toBeTruthy();
    });

    it('revokes a refresh token so it can no longer be exchanged', async () => {
      const tokens = await tokensFor('openid profile email offline_access');

      const revoked = await auth.handler(
        new Request(`${BASE_URL}/api/auth/oauth2/revoke`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            token: tokens.refresh_token as string,
            client_id: 'devflare',
            client_secret: DEVFLARE_SECRET,
          }),
        }),
      );
      expect(revoked.status).toBe(200);

      const reuse = await exchangeCode(auth, {
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token as string,
        client_id: 'devflare',
        client_secret: DEVFLARE_SECRET,
      });
      expect(reuse.ok).toBe(false);
    });
  });

  describe('client registration is closed', () => {
    it('refuses to create a client even for a signed-in user', async () => {
      const { cookie } = await signUp(auth);

      const response = await auth.handler(
        new Request(`${BASE_URL}/api/auth/oauth2/create-client`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', cookie },
          body: JSON.stringify({
            redirect_uris: ['https://attacker.test/callback'],
            client_name: 'Not mine',
          }),
        }),
      );

      expect(response.ok).toBe(false);
    });

    it('refuses dynamic registration', async () => {
      const response = await auth.handler(
        new Request(`${BASE_URL}/api/auth/oauth2/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            redirect_uris: ['https://attacker.test/callback'],
          }),
        }),
      );

      expect(response.ok).toBe(false);
    });

    it('leaves no client behind for a rejected registration to use', async () => {
      const { cookie } = await signUp(auth);

      await auth.handler(
        new Request(`${BASE_URL}/api/auth/oauth2/create-client`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', cookie },
          body: JSON.stringify({
            redirect_uris: ['https://attacker.test/callback'],
          }),
        }),
      );

      // Whatever the endpoint answered, nothing new can authorize.
      const { location } = await authorize(
        auth,
        {
          client_id: 'attacker',
          redirect_uri: 'https://attacker.test/callback',
          state: 'state-1',
        },
        cookie,
      );
      expect(location).not.toContain('code=');
    });
  });

  describe('multiple independent applications', () => {
    it('runs a full flow for an app outside this monorepo', async () => {
      const { cookie } = await signUp(auth);
      const { location } = await authorize(
        auth,
        {
          client_id: 'imaginaryx',
          redirect_uri: IMAGINARYX_REDIRECT,
          state: 'imaginaryx-state',
        },
        cookie,
      );

      const url = new URL(location as string);
      expect(`${url.origin}${url.pathname}`).toBe(IMAGINARYX_REDIRECT);
      expect(url.searchParams.get('state')).toBe('imaginaryx-state');

      const response = await exchangeCode(auth, {
        grant_type: 'authorization_code',
        code: url.searchParams.get('code') as string,
        redirect_uri: IMAGINARYX_REDIRECT,
        client_id: 'imaginaryx',
        client_secret: IMAGINARYX_SECRET,
        code_verifier: VERIFIER,
      });

      expect(response.status).toBe(200);
      const tokens = (await response.json()) as { id_token: string };
      // Audience-scoped: DevFlare cannot accept a token minted for Imaginaryx.
      expect(decodeJwtPart(tokens.id_token, 1)['aud']).toBe('imaginaryx');
    });

    it('shares one user account across applications', async () => {
      const { cookie } = await signUp(auth);

      const first = await authorize(
        auth,
        {
          client_id: 'devflare',
          redirect_uri: DEVFLARE_REDIRECT,
          state: 's1',
        },
        cookie,
      );
      const second = await authorize(
        auth,
        {
          client_id: 'imaginaryx',
          redirect_uri: IMAGINARYX_REDIRECT,
          state: 's2',
        },
        cookie,
      );

      const subjectOf = async (
        location: string,
        client: string,
        secret: string,
        redirectUri: string,
      ) => {
        const response = await exchangeCode(auth, {
          grant_type: 'authorization_code',
          code: new URL(location).searchParams.get('code') as string,
          redirect_uri: redirectUri,
          client_id: client,
          client_secret: secret,
          code_verifier: VERIFIER,
        });
        const tokens = (await response.json()) as { id_token: string };
        return decodeJwtPart(tokens.id_token, 1)['sub'];
      };

      // Same person, one already-authenticated provider session, no second
      // sign-in: this is what makes it one identity across my apps.
      expect(
        await subjectOf(
          first.location as string,
          'devflare',
          DEVFLARE_SECRET,
          DEVFLARE_REDIRECT,
        ),
      ).toBe(
        await subjectOf(
          second.location as string,
          'imaginaryx',
          IMAGINARYX_SECRET,
          IMAGINARYX_REDIRECT,
        ),
      );
    });
  });

  describe('resuming the flow after the user authenticates', () => {
    /**
     * The provider signs the authorization request into the login page's query
     * string and resumes it when the page hands that string back on sign-in.
     * This is what makes GitHub work for a consumer app that knows nothing about
     * GitHub — and what the login page's `oauth_query` handling depends on, so
     * it is asserted rather than assumed.
     */
    async function parkedAuthorizationRequest() {
      const response = await auth.handler(
        authorizeRequest({
          client_id: 'devflare',
          redirect_uri: DEVFLARE_REDIRECT,
          state: 'parked-state',
        }),
      );
      const location = response.headers.get('location') as string;
      expect(location).toContain('/login');
      return new URL(location, BASE_URL).search.replace(/^\?/, '');
    }

    it('resumes it when the user signs up on the login page', async () => {
      const oauthQuery = await parkedAuthorizationRequest();

      const response = await auth.handler(
        new Request(`${BASE_URL}/api/auth/sign-up/email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // The page submits with fetch(), so the provider answers with the
            // continuation URL in the body instead of a 302 the fetch would
            // follow invisibly.
            'sec-fetch-mode': 'cors',
          },
          body: JSON.stringify({
            email: 'new@devflare.test',
            password: 'TestPass123',
            name: 'New User',
            oauth_query: oauthQuery,
          }),
        }),
      );

      const body = (await response.json()) as {
        redirect?: boolean;
        url?: string;
      };
      expect(body.redirect).toBe(true);
      const url = new URL(body.url as string);
      expect(`${url.origin}${url.pathname}`).toBe(DEVFLARE_REDIRECT);
      expect(url.searchParams.get('state')).toBe('parked-state');
      expect(url.searchParams.get('code')).toBeTruthy();
    });

    it('resumes it when the user signs in with a password', async () => {
      await signUp(auth);
      const oauthQuery = await parkedAuthorizationRequest();

      const response = await auth.handler(
        new Request(`${BASE_URL}/api/auth/sign-in/email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'sec-fetch-mode': 'cors',
          },
          body: JSON.stringify({
            email: 'owner@devflare.test',
            password: 'TestPass123',
            oauth_query: oauthQuery,
          }),
        }),
      );

      const body = (await response.json()) as { url?: string };
      expect(body.url).toContain(DEVFLARE_REDIRECT);
      expect(body.url).toContain('code=');
    });

    it('refuses a tampered authorization request', async () => {
      await signUp(auth);
      const oauthQuery = await parkedAuthorizationRequest();
      const tampered = oauthQuery.replace(
        encodeURIComponent(DEVFLARE_REDIRECT),
        encodeURIComponent('https://attacker.test/callback'),
      );

      const response = await auth.handler(
        new Request(`${BASE_URL}/api/auth/sign-in/email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'sec-fetch-mode': 'cors',
          },
          body: JSON.stringify({
            email: 'owner@devflare.test',
            password: 'TestPass123',
            oauth_query: tampered,
          }),
        }),
      );

      expect(response.ok).toBe(false);
      expect(await response.text()).not.toContain(
        'attacker.test/callback?code',
      );
    });
  });

  describe('when no client is registered', () => {
    it('keeps password sign-in working and authorizes nobody', async () => {
      const bare = await createTestAuth(
        createTestEnv({
          OAUTH_CLIENTS: undefined,
          OAUTH_CLIENT_SECRETS: undefined,
        }),
      );

      const { cookie } = await signUp(bare);
      const { location } = await authorize(
        bare,
        {
          client_id: 'devflare',
          redirect_uri: DEVFLARE_REDIRECT,
          state: 'state-1',
        },
        cookie,
      );

      expect(location).toContain('error=invalid_client');
    });
  });
});
