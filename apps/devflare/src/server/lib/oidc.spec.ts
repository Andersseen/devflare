// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import {
  authorizationUrl,
  codeChallenge,
  resolveOidcConfig,
  safeReturnTo,
  type RequestContext,
} from './oidc';

/**
 * The `oidc.ts` helpers decide where the browser is sent and what proves the
 * code exchange, so they are unit-tested independently of a running provider.
 *
 * Node environment: this is server code, and jsdom has no `crypto.subtle` — the
 * S256 challenge would throw before it could be checked.
 */

function withBindings(env: Record<string, string> = {}): RequestContext {
  return { cloudflare: { env } };
}

describe('resolveOidcConfig', () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  it('reads the Cloudflare bindings', () => {
    const config = resolveOidcConfig(
      withBindings({
        DEV_AUTH_URL: 'https://auth.example.com',
        DEV_AUTH_CLIENT_ID: 'devflare',
        DEV_AUTH_CLIENT_SECRET: 'shh',
        DEV_AUTH_REDIRECT_URI: 'https://devflare.example.com/api/auth/callback',
      }),
    );

    expect(config).toEqual({
      issuer: 'https://auth.example.com',
      clientId: 'devflare',
      clientSecret: 'shh',
      redirectUri: 'https://devflare.example.com/api/auth/callback',
    });
  });

  it('falls back to process.env off Cloudflare', () => {
    process.env['DEV_AUTH_URL'] = 'https://auth.example.com';
    process.env['DEV_AUTH_CLIENT_ID'] = 'from-process-env';

    const config = resolveOidcConfig({});

    expect(config.issuer).toBe('https://auth.example.com');
    expect(config.clientId).toBe('from-process-env');
  });

  it('prefers the binding over process.env', () => {
    process.env['DEV_AUTH_CLIENT_ID'] = 'from-process-env';

    expect(
      resolveOidcConfig(withBindings({ DEV_AUTH_CLIENT_ID: 'from-binding' }))
        .clientId,
    ).toBe('from-binding');
  });

  it('normalises a trailing slash on the issuer', () => {
    // Otherwise every endpoint URL gets a double slash, which no longer matches
    // what the provider registered.
    expect(
      resolveOidcConfig(
        withBindings({ DEV_AUTH_URL: 'https://auth.example.com/' }),
      ).issuer,
    ).toBe('https://auth.example.com');
  });

  it('points at the local provider by default', () => {
    delete process.env['DEV_AUTH_URL'];
    expect(resolveOidcConfig(withBindings()).issuer).toBe(
      'http://localhost:8787',
    );
  });
});

describe('codeChallenge', () => {
  it('matches the S256 vector from RFC 7636', async () => {
    await expect(
      codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
    ).resolves.toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('produces base64url with no padding', async () => {
    const challenge = await codeChallenge('anything');
    expect(challenge).not.toContain('=');
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('authorizationUrl', () => {
  const config = {
    issuer: 'https://auth.example.com',
    clientId: 'devflare',
    redirectUri: 'https://devflare.example.com/api/auth/callback',
  };

  it('builds an authorization code + PKCE request', () => {
    const url = new URL(
      authorizationUrl(config, {
        state: 'state-value',
        challenge: 'challenge-value',
        nonce: 'nonce-value',
      }),
    );

    expect(`${url.origin}${url.pathname}`).toBe(
      'https://auth.example.com/api/auth/oauth2/authorize',
    );
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('devflare');
    expect(url.searchParams.get('redirect_uri')).toBe(config.redirectUri);
    expect(url.searchParams.get('state')).toBe('state-value');
    expect(url.searchParams.get('nonce')).toBe('nonce-value');
    expect(url.searchParams.get('code_challenge')).toBe('challenge-value');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')).toBe('openid profile email');
  });

  it('never puts the client secret in the browser-visible URL', () => {
    const url = authorizationUrl(
      { ...config, clientSecret: 'super-secret' },
      { state: 's', challenge: 'c', nonce: 'n' },
    );

    expect(url).not.toContain('super-secret');
  });
});

describe('safeReturnTo', () => {
  it('keeps a same-site path', () => {
    expect(safeReturnTo('/projects')).toBe('/projects');
    expect(safeReturnTo('/projects?tab=all')).toBe('/projects?tab=all');
  });

  it.each([
    ['an absolute URL', 'https://attacker.test/'],
    ['a protocol-relative URL', '//attacker.test/'],
    ['a bare path', 'projects'],
    ['a non-string', 42],
    ['nothing', undefined],
  ])('falls back to the root for %s', (_label, value) => {
    expect(safeReturnTo(value)).toBe('/');
  });
});
