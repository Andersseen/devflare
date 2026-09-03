import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createDevAuthClient, type AuthTransaction } from './client';
import { clearDiscoveryCache } from './discovery';
import {
  AuthorizationDeniedError,
  InvalidStateError,
  ProtocolError,
} from './errors';

const ISSUER = 'https://auth.example.com';

const CONFIG = {
  issuer: ISSUER,
  clientId: 'devflare',
  clientSecret: 'super-secret',
  redirectUri: 'https://devflare.example.com/api/auth/callback',
};

function discoveryDoc() {
  return new Response(
    JSON.stringify({
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/api/auth/oauth2/authorize`,
      token_endpoint: `${ISSUER}/api/auth/oauth2/token`,
      userinfo_endpoint: `${ISSUER}/api/auth/oauth2/userinfo`,
      end_session_endpoint: `${ISSUER}/api/auth/oauth2/end-session`,
    }),
  );
}

beforeEach(() => {
  clearDiscoveryCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearDiscoveryCache();
});

describe('createAuthorizationRequest', () => {
  it('builds a request with state, nonce, S256 PKCE, and a sanitized returnTo', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(discoveryDoc()));
    const client = createDevAuthClient(CONFIG);

    const { url, transaction } = await client.createAuthorizationRequest({
      returnTo: '/projects',
    });
    const parsed = new URL(url);

    expect(`${parsed.origin}${parsed.pathname}`).toBe(
      `${ISSUER}/api/auth/oauth2/authorize`,
    );
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('client_id')).toBe('devflare');
    expect(parsed.searchParams.get('scope')).toBe('openid profile email');
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
    expect(parsed.searchParams.get('state')).toBe(transaction.state);
    expect(parsed.searchParams.get('nonce')).toBe(transaction.nonce);
    expect(transaction.returnTo).toBe('/projects');
  });

  it('never puts the client secret in the authorization URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(discoveryDoc()));
    const client = createDevAuthClient(CONFIG);

    const { url } = await client.createAuthorizationRequest();

    expect(url).not.toContain('super-secret');
  });

  it('rejects an unsafe returnTo rather than embedding it in the transaction', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(discoveryDoc()));
    const client = createDevAuthClient(CONFIG);

    const { transaction } = await client.createAuthorizationRequest({
      returnTo: 'https://attacker.example.com/',
    });

    expect(transaction.returnTo).toBe('/');
  });

  it('generates a fresh state and verifier on every call', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(discoveryDoc()));
    const client = createDevAuthClient(CONFIG);

    const first = await client.createAuthorizationRequest();
    const second = await client.createAuthorizationRequest();

    expect(first.transaction.state).not.toBe(second.transaction.state);
    expect(first.transaction.codeVerifier).not.toBe(
      second.transaction.codeVerifier,
    );
  });
});

describe('handleCallback', () => {
  const transaction: AuthTransaction = {
    state: 'state-1',
    nonce: 'nonce-1',
    codeVerifier: 'verifier-1',
    returnTo: '/projects',
  };

  it('exchanges a valid code and returns the normalized identity', async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('.well-known')) return Promise.resolve(discoveryDoc());
      if (url.includes('/oauth2/token')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ access_token: 'at-1', token_type: 'Bearer' }),
          ),
        );
      }
      if (url.includes('/oauth2/userinfo')) {
        return Promise.resolve(
          new Response(JSON.stringify({ sub: 'user-1', email: 'a@b.com' })),
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createDevAuthClient(CONFIG);
    const result = await client.handleCallback(
      { code: 'the-code', state: 'state-1' },
      transaction,
    );

    expect(result.identity).toEqual({
      subject: 'user-1',
      email: 'a@b.com',
      name: undefined,
      picture: undefined,
    });
    expect(result.tokens.access_token).toBe('at-1');
  });

  it('throws AuthorizationDeniedError when the provider reports an error', async () => {
    const client = createDevAuthClient(CONFIG);

    const error = await client
      .handleCallback({ error: 'access_denied' }, transaction)
      .catch((e) => e);

    expect(error).toBeInstanceOf(AuthorizationDeniedError);
    expect((error as AuthorizationDeniedError).code).toBe('access_denied');
  });

  it('throws InvalidStateError when there is no transaction to check against', async () => {
    const client = createDevAuthClient(CONFIG);

    await expect(
      client.handleCallback({ code: 'the-code', state: 'state-1' }, null),
    ).rejects.toBeInstanceOf(InvalidStateError);
  });

  it('throws InvalidStateError when the code is missing', async () => {
    const client = createDevAuthClient(CONFIG);

    await expect(
      client.handleCallback({ state: 'state-1' }, transaction),
    ).rejects.toBeInstanceOf(InvalidStateError);
  });

  it('throws InvalidStateError when state does not match — including a replayed one', async () => {
    const client = createDevAuthClient(CONFIG);

    await expect(
      client.handleCallback(
        { code: 'the-code', state: 'a-different-state' },
        transaction,
      ),
    ).rejects.toBeInstanceOf(InvalidStateError);
  });

  it('throws InvalidStateError before ever discovering or calling the token endpoint', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const client = createDevAuthClient(CONFIG);

    await expect(
      client.handleCallback({ code: 'x', state: 'wrong' }, transaction),
    ).rejects.toBeInstanceOf(InvalidStateError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('wraps a token-exchange failure in ProtocolError, not the raw provider error', async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('.well-known')) return Promise.resolve(discoveryDoc());
      if (url.includes('/oauth2/token')) {
        return Promise.resolve(
          new Response('invalid_grant: code already used', { status: 400 }),
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createDevAuthClient(CONFIG);
    const error = await client
      .handleCallback({ code: 'the-code', state: 'state-1' }, transaction)
      .catch((e) => e);

    expect(error).toBeInstanceOf(ProtocolError);
    expect(String(error.message)).not.toContain('invalid_grant');
  });

  it('wraps a userinfo failure in ProtocolError', async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('.well-known')) return Promise.resolve(discoveryDoc());
      if (url.includes('/oauth2/token')) {
        return Promise.resolve(
          new Response(JSON.stringify({ access_token: 'at-1' })),
        );
      }
      if (url.includes('/oauth2/userinfo')) {
        return Promise.resolve(new Response('nope', { status: 401 }));
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createDevAuthClient(CONFIG);

    await expect(
      client.handleCallback(
        { code: 'the-code', state: 'state-1' },
        transaction,
      ),
    ).rejects.toBeInstanceOf(ProtocolError);
  });
});

describe('logoutUrl', () => {
  it('returns the end-session endpoint with a post-logout redirect', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(discoveryDoc()));
    const client = createDevAuthClient(CONFIG);

    const url = await client.logoutUrl({
      postLogoutRedirectUri: 'https://devflare.example.com/',
    });

    expect(url).toContain(`${ISSUER}/api/auth/oauth2/end-session`);
    expect(url).toContain(
      `post_logout_redirect_uri=${encodeURIComponent('https://devflare.example.com/')}`,
    );
  });

  it('returns null when the provider has no end-session endpoint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            issuer: ISSUER,
            authorization_endpoint: `${ISSUER}/api/auth/oauth2/authorize`,
            token_endpoint: `${ISSUER}/api/auth/oauth2/token`,
            userinfo_endpoint: `${ISSUER}/api/auth/oauth2/userinfo`,
          }),
        ),
      ),
    );
    const client = createDevAuthClient(CONFIG);

    await expect(client.logoutUrl()).resolves.toBeNull();
  });
});
