import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  accountHints,
  authorizationUrl,
  CF_OAUTH_SCOPES,
  CloudflareOAuthError,
  exchangeCode,
  pickAccount,
  preferredAccountId,
  refreshTokens,
  resolveCloudflareOAuthConfig,
  resolveConnectedAccount,
  revokeToken,
  type CloudflareOAuthConfig,
} from './cloudflare-oauth';

/**
 * The properties worth pinning are the ones a live consent screen would only
 * teach us the hard way: that the challenge is S256, that the client secret
 * travels in the form body and never in a URL or a thrown message, and that an
 * `invalid_grant` is distinguishable from a transient failure — because the
 * first must stop the retry loop and the second must not.
 */

const CONFIG: CloudflareOAuthConfig = {
  clientId: 'client-id',
  clientSecret: 'client-secret-value',
  redirectUri: 'https://devflare.test/api/v1/cloud/connect/callback',
};

afterEach(() => vi.unstubAllGlobals());

function stubFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function bodyOf(fetchMock: ReturnType<typeof stubFetch>): URLSearchParams {
  return new URLSearchParams(
    fetchMock.mock.calls[0][1].body as URLSearchParams,
  );
}

describe('resolveCloudflareOAuthConfig', () => {
  const env = {
    CLOUDFLARE_OAUTH_CLIENT_ID: 'client-id',
    CLOUDFLARE_OAUTH_CLIENT_SECRET: 'client-secret-value',
    CLOUDFLARE_OAUTH_REDIRECT_URI: CONFIG.redirectUri,
  };

  it('reads the Cloudflare binding', () => {
    expect(resolveCloudflareOAuthConfig({ cloudflare: { env } })).toEqual(
      CONFIG,
    );
  });

  it('answers null when any half is missing', () => {
    // Not an error: a deployment without an OAuth client falls back to
    // CLOUDFLARE_API_TOKEN, and the UI offers the manual instructions.
    for (const key of Object.keys(env)) {
      const partial = { ...env, [key]: undefined };
      expect(
        resolveCloudflareOAuthConfig({ cloudflare: { env: partial } }),
      ).toBeNull();
    }
  });

  it('reads the account id separately from the credential', () => {
    expect(
      preferredAccountId({
        cloudflare: { env: { CLOUDFLARE_ACCOUNT_ID: 'a1' } },
      }),
    ).toBe('a1');
  });
});

describe('authorizationUrl', () => {
  const url = new URL(
    authorizationUrl(CONFIG, { state: 'st', challenge: 'ch' }),
  );

  it('points at Cloudflare’s authorization endpoint', () => {
    expect(url.origin + url.pathname).toBe(
      'https://dash.cloudflare.com/oauth2/auth',
    );
  });

  it('asks for a code with an S256 challenge', () => {
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge')).toBe('ch');
    // `plain` is advertised by the server and must never be used: a challenge
    // equal to its verifier proves nothing about who redeems the code.
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBe('st');
  });

  it('asks for the permissions the Cloud section actually uses', () => {
    const scopes = url.searchParams.get('scope')?.split(' ') ?? [];
    expect(scopes).toContain('page.write');
    expect(scopes).toEqual([...CF_OAUTH_SCOPES]);
  });

  it('never asks for a scope no client can be granted', () => {
    // Verified against the real authorization server on 2026-08-17: each of
    // these is refused with `invalid_scope`, which fails the whole flow before
    // the consent screen. None of them exists in the scope catalog either.
    const scopes = url.searchParams.get('scope')?.split(' ') ?? [];
    expect(scopes).not.toContain('offline_access');
    expect(scopes).not.toContain('offline');
    expect(scopes).not.toContain('openid');
  });

  it('never puts the client secret in the redirect', () => {
    expect(url.toString()).not.toContain(CONFIG.clientSecret);
  });
});

describe('exchangeCode', () => {
  it('posts the code, the verifier and client_secret_post credentials', async () => {
    const fetchMock = stubFetch(json({ access_token: 'at', expires_in: 900 }));

    await exchangeCode(CONFIG, 'the-code', 'the-verifier');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://dash.cloudflare.com/oauth2/token');
    expect(init.method).toBe('POST');

    const body = bodyOf(fetchMock);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('the-code');
    expect(body.get('code_verifier')).toBe('the-verifier');
    expect(body.get('redirect_uri')).toBe(CONFIG.redirectUri);
    expect(body.get('client_secret')).toBe(CONFIG.clientSecret);
  });

  it('refuses a 200 that carries no token', async () => {
    stubFetch(json({ token_type: 'bearer' }));

    await expect(exchangeCode(CONFIG, 'c', 'v')).rejects.toThrow(
      CloudflareOAuthError,
    );
  });

  it('keeps the secret out of the error it throws', async () => {
    stubFetch(json({ error: 'invalid_client' }, 401));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(exchangeCode(CONFIG, 'c', 'v')).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining(CONFIG.clientSecret),
      }),
    );
  });

  it('reports an unreachable endpoint rather than throwing a fetch error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));

    await expect(exchangeCode(CONFIG, 'c', 'v')).rejects.toThrow(
      CloudflareOAuthError,
    );
  });
});

describe('refreshTokens', () => {
  it('sends the refresh grant', async () => {
    const fetchMock = stubFetch(json({ access_token: 'at2', expires_in: 900 }));

    await refreshTokens(CONFIG, 'the-refresh-token');

    const body = bodyOf(fetchMock);
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('the-refresh-token');
  });

  it('surfaces invalid_grant as a code, so the caller can stop retrying', async () => {
    stubFetch(json({ error: 'invalid_grant' }, 400));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(refreshTokens(CONFIG, 'spent')).rejects.toMatchObject({
      code: 'invalid_grant',
    });
  });

  it('leaves the code null when the failure is not an OAuth one', async () => {
    stubFetch(new Response('<html>gateway</html>', { status: 502 }));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(refreshTokens(CONFIG, 'r')).rejects.toMatchObject({
      code: null,
    });
  });
});

describe('revokeToken', () => {
  it('answers false instead of throwing when revocation fails', async () => {
    // Disconnecting locally must succeed even when the upstream call does not,
    // or a grant Cloudflare already dropped could never be cleared here.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    await expect(revokeToken(CONFIG, 'token')).resolves.toBe(false);
  });
});

describe('accountHints', () => {
  it('reads ids out of a string, a list, or a URL', () => {
    const id = 'c32a93ee83fe9b5d53c63fcc73b90bb9';

    expect(accountHints({ access_token: 'a', token_type: 'bearer' })).toEqual(
      [],
    );
    expect(
      accountHints({ access_token: 'a', token_type: 'bearer', resource: id }),
    ).toEqual([id]);
    expect(
      accountHints({
        access_token: 'a',
        token_type: 'bearer',
        resource: [`https://api.cloudflare.com/client/v4/accounts/${id}`],
      }),
    ).toEqual([id]);
  });
});

describe('pickAccount', () => {
  const accounts = [
    { id: 'aaa', name: 'First' },
    { id: 'bbb', name: 'Second' },
  ];

  it('prefers the account this install already points at', () => {
    expect(pickAccount(accounts, 'bbb')).toEqual(accounts[1]);
  });

  it('falls back to a hint, then to the first', () => {
    expect(pickAccount(accounts, undefined, ['bbb'])).toEqual(accounts[1]);
    expect(pickAccount(accounts, undefined, ['unknown'])).toEqual(accounts[0]);
    expect(pickAccount(accounts)).toEqual(accounts[0]);
  });

  it('ignores a preference the grant does not cover', () => {
    expect(pickAccount(accounts, 'not-granted')).toEqual(accounts[0]);
  });

  it('answers null for an empty grant rather than inventing an account', () => {
    expect(pickAccount([], 'aaa')).toBeNull();
  });
});

describe('resolveConnectedAccount', () => {
  const tokens = { access_token: 'at', token_type: 'bearer' };

  it('names the account from the listing', async () => {
    stubFetch(json({ success: true, result: [{ id: 'aaa', name: 'First' }] }));

    await expect(resolveConnectedAccount(tokens)).resolves.toEqual({
      id: 'aaa',
      name: 'First',
    });
  });

  it('degrades to the configured id when the listing cannot be read', async () => {
    // memberships.read is the one scope whose absence should cost a name, not
    // the whole connection.
    stubFetch(
      json({ success: false, errors: [{ code: 9109, message: 'nope' }] }, 403),
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(resolveConnectedAccount(tokens, 'aaa')).resolves.toEqual({
      id: 'aaa',
      name: null,
    });
  });

  it('fails when there is neither a listing nor a configured account', async () => {
    stubFetch(json({ success: true, result: [] }));

    await expect(resolveConnectedAccount(tokens)).rejects.toThrow(
      CloudflareOAuthError,
    );
  });
});
