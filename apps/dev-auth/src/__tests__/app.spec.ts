import { describe, it, expect } from 'vitest';
import { app } from '../index';
import type { Env } from '../index';

/**
 * Routing-level checks on the Hono app. Anything that needs the database lives in
 * ./oauth-provider.spec.ts; these paths answer before any binding is touched, so
 * a bare env is enough.
 */
const env = {
  BETTER_AUTH_URL: 'https://auth.test',
  BETTER_AUTH_SECRET: 'test-secret-at-least-32-characters-long',
  OAUTH_CLIENTS: JSON.stringify([
    {
      clientId: 'devflare',
      name: 'DevFlare',
      type: 'web',
      redirectURIs: ['https://devflare.test/api/auth/callback'],
    },
  ]),
  OAUTH_CLIENT_SECRETS: JSON.stringify({
    devflare: 'devflare-client-secret-with-entropy',
  }),
} as Env;

function request(path: string, init?: RequestInit): Promise<Response> {
  return Promise.resolve(
    app.fetch(new Request(`https://auth.test${path}`, init), env),
  );
}

describe('dev-auth Hono app', () => {
  it('serves a health check', async () => {
    const response = await request('/health');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'ok',
      service: 'dev-auth',
    });
  });

  describe('client registration is closed at the edge', () => {
    // Three independent locks stop a client being created; this is the outermost
    // one. The plugin's own refusal is covered in ./oauth-provider.spec.ts.
    const paths = [
      '/api/auth/oauth2/register',
      '/api/auth/oauth2/create-client',
      '/api/auth/oauth2/update-client',
      '/api/auth/oauth2/delete-client',
      '/api/auth/oauth2/client/rotate-secret',
    ];

    it.each(paths)('refuses POST %s', async (path) => {
      const response = await request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          redirect_uris: ['https://attacker.test/callback'],
          client_name: 'Not mine',
        }),
      });

      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ error: 'invalid_request' });
    });

    it.each(paths)('refuses GET %s too, not just POST', async (path) => {
      expect((await request(path)).status).toBe(404);
    });
  });

  describe('discovery at the issuer', () => {
    // The issuer is this Worker's origin, so a generic client looks here rather
    // than under the /api/auth base path. Both documents are server-only inside
    // the plugin, which is why they are mounted by hand.
    it('serves the OpenID configuration', async () => {
      const response = await request('/.well-known/openid-configuration');

      expect(response.status).toBe(200);
      const metadata = (await response.json()) as Record<string, unknown>;
      expect(metadata['issuer']).toBe('https://auth.test');
      expect(metadata['authorization_endpoint']).toBe(
        'https://auth.test/api/auth/oauth2/authorize',
      );
      expect(metadata['jwks_uri']).toBe('https://auth.test/api/auth/jwks');
    });

    it('serves the OAuth authorization-server metadata', async () => {
      const response = await request('/.well-known/oauth-authorization-server');

      expect(response.status).toBe(200);
      const metadata = (await response.json()) as Record<string, unknown>;
      expect(metadata['issuer']).toBe('https://auth.test');
      expect(metadata['token_endpoint']).toBe(
        'https://auth.test/api/auth/oauth2/token',
      );
    });
  });

  describe('the provider has no application of its own', () => {
    it('sends an anonymous visitor to its own login page', async () => {
      // Not to a consumer app. `/` used to redirect to APP_URL, which quietly
      // made "signed in to DevAuth" mean "signed in to DevFlare".
      const response = await request('/');

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe('/login');
    });

    it('serves a login page that names no particular application', async () => {
      const response = await request('/login');
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(html).not.toContain('devflare.andersseen.dev');
      expect(html).not.toContain('data-app-url');
    });

    it('serves the consent page the provider requires', async () => {
      const response = await request('/consent');

      expect(response.status).toBe(200);
      expect(await response.text()).toContain('/api/auth/oauth2/consent');
    });
  });

  it('renders a 404 page for anything else', async () => {
    const response = await request('/nope');

    expect(response.status).toBe(404);
  });
});
