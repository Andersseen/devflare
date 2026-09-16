import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  AuthController,
  AuthControllerState,
  AuthUser,
} from '@dev-auth/client';
import { DEV_AUTH_CONTROLLER } from '../tokens';
import { DevAuth } from './auth.service';

const AUTH_USER: AuthUser = {
  id: 'u1',
  email: 'a@b.com',
  name: 'A B',
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function fakeController(initial: AuthControllerState) {
  let state = initial;
  const listeners = new Set<(state: AuthControllerState) => void>();
  const controller: AuthController = {
    getState: () => state,
    subscribe: vi.fn((listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    ready: vi.fn(() => Promise.resolve()),
    login: vi.fn(),
    logout: vi.fn(async () => {
      state = { status: 'anonymous', user: null, error: null };
      for (const listener of listeners) listener(state);
    }),
    updateProfile: vi.fn(),
    refresh: vi.fn(async () => undefined),
    dispose: vi.fn(),
  };
  return controller;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DevAuth', () => {
  it('starts loading, then resolves to anonymous with no session', async () => {
    const controller = fakeController({
      status: 'loading',
      user: null,
      error: null,
    });
    TestBed.configureTestingModule({
      providers: [
        DevAuth,
        { provide: DEV_AUTH_CONTROLLER, useValue: controller },
      ],
    });
    const auth = TestBed.inject(DevAuth);

    expect(auth.isLoading()).toBe(true);

    controller.getState = () => ({
      status: 'anonymous',
      user: null,
      error: null,
    });
    await auth.ready();

    expect(controller.ready).toHaveBeenCalled();
  });

  it('reflects the controller state it was constructed with', () => {
    const controller = fakeController({
      status: 'authenticated',
      user: AUTH_USER,
      error: null,
    });
    TestBed.configureTestingModule({
      providers: [
        DevAuth,
        { provide: DEV_AUTH_CONTROLLER, useValue: controller },
      ],
    });
    const auth = TestBed.inject(DevAuth);

    expect(auth.isLoading()).toBe(false);
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.user()?.id).toBe('u1');
  });

  it('updates its signals when the controller notifies a state change', () => {
    const controller = fakeController({
      status: 'loading',
      user: null,
      error: null,
    });
    TestBed.configureTestingModule({
      providers: [
        DevAuth,
        { provide: DEV_AUTH_CONTROLLER, useValue: controller },
      ],
    });
    const auth = TestBed.inject(DevAuth);
    expect(auth.isLoading()).toBe(true);

    const listener = vi.mocked(controller.subscribe).mock.calls[0][0];
    listener({ status: 'authenticated', user: AUTH_USER, error: null });

    expect(auth.isLoading()).toBe(false);
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.user()?.id).toBe('u1');
  });

  it('login() delegates to the shared controller', () => {
    const controller = fakeController({
      status: 'anonymous',
      user: null,
      error: null,
    });
    TestBed.configureTestingModule({
      providers: [
        DevAuth,
        { provide: DEV_AUTH_CONTROLLER, useValue: controller },
      ],
    });
    const auth = TestBed.inject(DevAuth);

    auth.login('/projects');

    expect(controller.login).toHaveBeenCalledWith('/projects');
  });

  it('logout() delegates to the controller and picks up its resulting state', async () => {
    const controller = fakeController({
      status: 'authenticated',
      user: AUTH_USER,
      error: null,
    });
    TestBed.configureTestingModule({
      providers: [
        DevAuth,
        { provide: DEV_AUTH_CONTROLLER, useValue: controller },
      ],
    });
    const auth = TestBed.inject(DevAuth);
    expect(auth.isAuthenticated()).toBe(true);

    await auth.logout();

    expect(controller.logout).toHaveBeenCalled();
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.user()).toBeNull();
  });

  it('updateName() delegates to the controller', async () => {
    const controller = fakeController({
      status: 'authenticated',
      user: AUTH_USER,
      error: null,
    });
    TestBed.configureTestingModule({
      providers: [
        DevAuth,
        { provide: DEV_AUTH_CONTROLLER, useValue: controller },
      ],
    });
    const auth = TestBed.inject(DevAuth);

    await auth.updateName('New Name');

    expect(controller.updateProfile).toHaveBeenCalledWith({ name: 'New Name' });
  });

  it('uses a real default controller when none is overridden', () => {
    TestBed.configureTestingModule({ providers: [DevAuth] });

    expect(() => TestBed.inject(DevAuth)).not.toThrow();
  });
});
