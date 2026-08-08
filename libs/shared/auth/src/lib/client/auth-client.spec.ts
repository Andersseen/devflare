import { describe, it, expect, vi, afterEach } from 'vitest';
import { createClient, signInUrl } from './auth-client';

describe('auth-client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exposes the session surface the app needs', () => {
    const client = createClient();
    expect(client.getSession).toBeDefined();
    expect(client.signIn).toBeDefined();
    expect(client.signOut).toBeDefined();
    expect(client.updateUser).toBeDefined();
  });

  it('reads the session from this app, not from the identity provider', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ user: { id: 'u1' } }), {
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const session = await createClient().getSession();

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/session', {
      credentials: 'include',
    });
    expect(session.user?.id).toBe('u1');
  });

  it('treats an unauthenticated response as no user rather than an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );

    await expect(createClient().getSession()).resolves.toEqual({ user: null });
  });

  it('sends sign-in through the provider, carrying the return path', () => {
    expect(signInUrl('/projects')).toBe('/api/auth/login?returnTo=%2Fprojects');
  });

  it('returns to the root by default', () => {
    expect(signInUrl()).toBe('/api/auth/login?returnTo=%2F');
  });

  it('encodes a return path so it cannot inject extra query parameters', () => {
    expect(signInUrl('/p?a=1&b=2')).toBe(
      '/api/auth/login?returnTo=%2Fp%3Fa%3D1%26b%3D2',
    );
  });
});
