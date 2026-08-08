import { describe, it, expect } from 'vitest';
import { app } from '../index';
import type { Env } from '../index';

/**
 * Routing-level checks on the Hono app. Anything that needs the database lives in
 * ./oidc-provider.spec.ts; these paths answer before any binding is touched, so a
 * bare env is enough.
 */
const env = {
  BETTER_AUTH_URL: 'https://auth.test',
  BETTER_AUTH_SECRET: 'test-secret-at-least-32-characters-long',
} as Env;

function request(path: string, init?: RequestInit): Promise<Response> {
  return app.fetch(new Request(`https://auth.test${path}`, init), env);
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

  it('refuses dynamic client registration', async () => {
    // better-auth would otherwise let any authenticated user register a client
    // with redirect URIs of their choosing; the registry is the only way in.
    const response = await request('/api/auth/oauth2/register', {
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

  it('refuses it on GET too, not just POST', async () => {
    expect((await request('/api/auth/oauth2/register')).status).toBe(404);
  });

  it('redirects the bare root to the login page', async () => {
    const response = await request('/');

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/login');
  });
});
