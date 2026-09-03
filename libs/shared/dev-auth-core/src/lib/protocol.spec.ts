import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildAuthorizationUrl, exchangeCode, fetchUserInfo } from './protocol';
import { ProtocolError } from './errors';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildAuthorizationUrl', () => {
  it('builds an authorization code + PKCE request', () => {
    const url = new URL(
      buildAuthorizationUrl(
        'https://auth.example.com/api/auth/oauth2/authorize',
        {
          clientId: 'devflare',
          redirectUri: 'https://devflare.example.com/api/auth/callback',
          scope: 'openid profile email',
          state: 'state-value',
          nonce: 'nonce-value',
          challenge: 'challenge-value',
        },
      ),
    );

    expect(`${url.origin}${url.pathname}`).toBe(
      'https://auth.example.com/api/auth/oauth2/authorize',
    );
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('devflare');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://devflare.example.com/api/auth/callback',
    );
    expect(url.searchParams.get('state')).toBe('state-value');
    expect(url.searchParams.get('nonce')).toBe('nonce-value');
    expect(url.searchParams.get('code_challenge')).toBe('challenge-value');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')).toBe('openid profile email');
  });
});

describe('exchangeCode', () => {
  const params = {
    tokenEndpoint: 'https://auth.example.com/api/auth/oauth2/token',
    clientId: 'devflare',
    redirectUri: 'https://devflare.example.com/api/auth/callback',
    code: 'the-code',
    codeVerifier: 'the-verifier',
  };

  it('never puts the client secret in a browser-visible place — only the POST body', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ access_token: 'at' })));
    vi.stubGlobal('fetch', fetchMock);

    await exchangeCode({ ...params, clientSecret: 'super-secret' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain('super-secret');
    expect(String(init.body)).toContain('client_secret=super-secret');
  });

  it('omits client_secret for a public client', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ access_token: 'at' })));
    vi.stubGlobal('fetch', fetchMock);

    await exchangeCode(params);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(init.body)).not.toContain('client_secret');
  });

  it('throws a ProtocolError, never the provider body, on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(
          () => new Response('client_secret is wrong', { status: 400 }),
        ),
    );

    await expect(exchangeCode(params)).rejects.toBeInstanceOf(ProtocolError);
    await expect(exchangeCode(params)).rejects.not.toThrow(
      /client_secret is wrong/,
    );
  });
});

describe('fetchUserInfo', () => {
  it('normalizes the provider response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            sub: 'user-1',
            email: 'a@b.com',
            name: 'A B',
            image: 'https://img',
          }),
        ),
      ),
    );

    await expect(
      fetchUserInfo('https://auth.example.com/userinfo', 'token'),
    ).resolves.toEqual({
      subject: 'user-1',
      email: 'a@b.com',
      name: 'A B',
      picture: 'https://img',
    });
  });

  it('rejects a response with no subject', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ email: 'a@b.com' }))),
    );

    await expect(
      fetchUserInfo('https://auth.example.com/userinfo', 'token'),
    ).rejects.toBeInstanceOf(ProtocolError);
  });

  it('throws a ProtocolError on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('nope', { status: 401 })),
    );

    await expect(
      fetchUserInfo('https://auth.example.com/userinfo', 'bad-token'),
    ).rejects.toBeInstanceOf(ProtocolError);
  });
});
