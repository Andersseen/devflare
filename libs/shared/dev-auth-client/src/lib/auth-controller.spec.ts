import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createAuthController,
  signInUrl,
  AuthControllerRequestError,
} from './auth-controller';

const AUTH_USER = {
  id: 'u1',
  email: 'a@b.com',
  name: 'A B',
  emailVerified: true,
  createdAt: '2026-09-12T10:00:00.000Z',
  updatedAt: '2026-09-12T11:00:00.000Z',
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

    expect(controller.getState()).toEqual({
      status: 'loading',
      user: null,
      error: null,
    });
    await controller.ready();

    expect(controller.getState()).toEqual({
      status: 'anonymous',
      user: null,
      error: null,
    });
  });

  it('resolves to authenticated and normalizes wire date strings', async () => {
    vi.stubGlobal('fetch', mockFetchOnce({ user: AUTH_USER }));
    const controller = createAuthController();

    await controller.ready();

    expect(controller.getState().status).toBe('authenticated');
    expect(controller.getState().user?.id).toBe('u1');
    expect(controller.getState().user?.createdAt).toBeInstanceOf(Date);
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
      error: null,
    });
  });

  it('represents a failed session lookup as error, not anonymous', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network down')),
    );
    const controller = createAuthController();

    await expect(controller.ready()).resolves.toBeUndefined();
    expect(controller.getState()).toEqual({
      status: 'error',
      user: null,
      error: { code: 'network_error', message: 'network down' },
    });
  });

  it('normalizes non-OK operation failures into SDK errors', async () => {
    vi.stubGlobal('fetch', mockFetchOnce({ user: AUTH_USER }));
    const controller = createAuthController();
    await controller.ready();

    vi.stubGlobal(
      'fetch',
      mockFetchOnce(
        { code: 'profile_invalid', message: 'Name is required' },
        { status: 422 },
      ),
    );

    await expect(controller.updateProfile({ name: '' })).rejects.toMatchObject({
      name: 'AuthControllerRequestError',
      code: 'profile_invalid',
      message: 'Name is required',
      status: 422,
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

  it('login() navigates to this app own login route, carrying only a safe return path', () => {
    vi.stubGlobal('fetch', mockFetchOnce({ user: null }));
    const controller = createAuthController();
    const assign = vi.fn();
    vi.stubGlobal('location', { assign });

    controller.login('https://attacker.example.com/projects');

    expect(assign).toHaveBeenCalledWith('/api/auth/login?returnTo=%2F');
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
      error: null,
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

  it('ignores stale refresh responses after a later request wins', async () => {
    let resolveFirst!: (response: Response) => void;
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          resolveFirst = resolve;
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ user: AUTH_USER }), {
          headers: { 'content-type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const controller = createAuthController();
    const second = controller.refresh();
    await second;
    resolveFirst(
      new Response(JSON.stringify({ user: null }), {
        headers: { 'content-type': 'application/json' },
      }),
    );
    await controller.ready();

    expect(controller.getState().status).toBe('authenticated');
  });

  it('dispose() prevents later state updates', async () => {
    vi.stubGlobal('fetch', mockFetchOnce({ user: AUTH_USER }));
    const controller = createAuthController();
    const listener = vi.fn();
    controller.subscribe(listener);

    controller.dispose();
    await controller.ready();

    expect(listener).not.toHaveBeenCalled();
    expect(controller.getState().status).toBe('loading');
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

  it('keeps request errors instanceof Error for consumer catch blocks', () => {
    const error = new AuthControllerRequestError({
      code: 'x',
      message: 'Nope',
      status: 500,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('x');
  });
});
