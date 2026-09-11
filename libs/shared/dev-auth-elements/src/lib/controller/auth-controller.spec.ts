import { describe, it, expect, vi, afterEach } from 'vitest';
import { createAuthController, signInUrl } from './auth-controller';

const AUTH_USER = {
  id: 'u1',
  email: 'a@b.com',
  name: 'A B',
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function mockFetchOnce(body: unknown, init: ResponseInit = {}) {
  return vi.fn().mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), {
      headers: { 'content-type': 'application/json' },
      ...init,
    }),
  );
}

describe('createAuthController', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts loading, then resolves to anonymous with no session', async () => {
    vi.stubGlobal('fetch', mockFetchOnce({ user: null }));
    const controller = createAuthController();

    expect(controller.getState()).toEqual({ status: 'loading', user: null });
    await controller.ready();

    expect(controller.getState()).toEqual({
      status: 'anonymous',
      user: null,
    });
  });

  it('resolves to authenticated when the session has a user', async () => {
    vi.stubGlobal('fetch', mockFetchOnce({ user: AUTH_USER }));
    const controller = createAuthController();

    await controller.ready();

    expect(controller.getState().status).toBe('authenticated');
    expect(controller.getState().user?.id).toBe('u1');
  });

  it('treats an unauthenticated response as anonymous rather than an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );
    const controller = createAuthController();

    await controller.ready();

    expect(controller.getState()).toEqual({
      status: 'anonymous',
      user: null,
    });
  });

  it('treats a failed session lookup as anonymous, not a thrown error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network down')),
    );
    const controller = createAuthController();

    await expect(controller.ready()).resolves.toBeUndefined();
    expect(controller.getState()).toEqual({
      status: 'anonymous',
      user: null,
    });
  });

  it('notifies subscribers on every state transition', async () => {
    vi.stubGlobal('fetch', mockFetchOnce({ user: AUTH_USER }));
    const controller = createAuthController();
    const states: string[] = [];
    controller.subscribe((state) => states.push(state.status));

    await controller.ready();

    expect(states).toEqual(['authenticated']);
  });

  it('stops notifying an unsubscribed listener', async () => {
    vi.stubGlobal('fetch', mockFetchOnce({ user: null }));
    const controller = createAuthController();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    unsubscribe();

    await controller.ready();

    expect(listener).not.toHaveBeenCalled();
  });

  it('login() navigates to this app own login route, carrying the return path', () => {
    vi.stubGlobal('fetch', mockFetchOnce({ user: null }));
    const controller = createAuthController();
    const assign = vi.fn();
    vi.stubGlobal('location', { assign });

    controller.login('/projects');

    expect(assign).toHaveBeenCalledWith('/api/auth/login?returnTo=%2Fprojects');
  });

  it('logout() clears the user and notifies subscribers', async () => {
    vi.stubGlobal('fetch', mockFetchOnce({ user: AUTH_USER }));
    const controller = createAuthController();
    await controller.ready();
    expect(controller.getState().status).toBe('authenticated');

    vi.stubGlobal('fetch', mockFetchOnce({}));
    await controller.logout();

    expect(controller.getState()).toEqual({
      status: 'anonymous',
      user: null,
    });
  });

  it('updateProfile() applies the returned user to state', async () => {
    vi.stubGlobal('fetch', mockFetchOnce({ user: AUTH_USER }));
    const controller = createAuthController();
    await controller.ready();

    const updated = { ...AUTH_USER, name: 'New Name' };
    vi.stubGlobal('fetch', mockFetchOnce({ user: updated }));
    await controller.updateProfile({ name: 'New Name' });

    expect(controller.getState().user?.name).toBe('New Name');
  });

  it('refresh() re-runs the session lookup on demand', async () => {
    vi.stubGlobal('fetch', mockFetchOnce({ user: null }));
    const controller = createAuthController();
    await controller.ready();
    expect(controller.getState().status).toBe('anonymous');

    vi.stubGlobal('fetch', mockFetchOnce({ user: AUTH_USER }));
    await controller.refresh();

    expect(controller.getState().status).toBe('authenticated');
  });

  it('returns to the root by default', () => {
    expect(signInUrl()).toBe('/api/auth/login?returnTo=%2F');
  });

  it('encodes a return path so it cannot inject extra query parameters', () => {
    expect(signInUrl('/p?a=1&b=2')).toBe(
      '/api/auth/login?returnTo=%2Fp%3Fa%3D1%26b%3D2',
    );
  });

  it('honors a configured basePath', async () => {
    const fetchMock = mockFetchOnce({ user: null });
    vi.stubGlobal('fetch', fetchMock);
    const controller = createAuthController({ basePath: '/custom/auth' });
    await controller.ready();

    expect(fetchMock).toHaveBeenCalledWith('/custom/auth/session', {
      credentials: 'include',
    });
  });
});
