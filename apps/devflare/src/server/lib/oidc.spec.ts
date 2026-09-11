// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import { resolveOidcConfig, type RequestContext } from './oidc';

/**
 * `resolveOidcConfig` is the one piece of this module that is genuinely
 * DevFlare/Cloudflare-specific — everything else (PKCE, discovery, the code
 * exchange, userinfo, `safeReturnTo`) moved to @dev-auth/core and is
 * tested there (see libs/shared/dev-auth-core/src/lib/*.spec.ts).
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
