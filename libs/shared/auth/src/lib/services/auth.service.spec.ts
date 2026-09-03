import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEV_AUTH_BASE_PATH } from '../tokens';

const mockClient = vi.hoisted(() => ({
  getSession: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock('../client/auth-client', () => ({
  DEFAULT_BASE_PATH: '/api/auth',
  createClient: vi.fn(() => mockClient),
}));

import { createClient } from '../client/auth-client';
import { DevAuth } from './auth.service';

const AUTH_USER = {
  id: 'u1',
  email: 'a@b.com',
  name: 'A B',
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DevAuth', () => {
  it('starts loading, then resolves to anonymous with no session', async () => {
    mockClient.getSession.mockResolvedValue({ user: null });
    TestBed.configureTestingModule({ providers: [DevAuth] });
    const auth = TestBed.inject(DevAuth);

    expect(auth.isLoading()).toBe(true);
    await auth.ready();

    expect(auth.isLoading()).toBe(false);
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.user()).toBeNull();
  });

  it('resolves to authenticated when the session has a user', async () => {
    mockClient.getSession.mockResolvedValue({ user: AUTH_USER });
    TestBed.configureTestingModule({ providers: [DevAuth] });
    const auth = TestBed.inject(DevAuth);

    await auth.ready();

    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.user()?.id).toBe('u1');
  });

  it('treats a failed session lookup as anonymous, not an error', async () => {
    mockClient.getSession.mockRejectedValue(new Error('network down'));
    TestBed.configureTestingModule({ providers: [DevAuth] });
    const auth = TestBed.inject(DevAuth);

    await auth.ready();

    expect(auth.isLoading()).toBe(false);
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('login() delegates to the app-session client', async () => {
    mockClient.getSession.mockResolvedValue({ user: null });
    TestBed.configureTestingModule({ providers: [DevAuth] });
    const auth = TestBed.inject(DevAuth);
    await auth.ready();

    auth.login('/projects');

    expect(mockClient.login).toHaveBeenCalledWith('/projects');
  });

  it('logout() clears the user signal', async () => {
    mockClient.getSession.mockResolvedValue({ user: AUTH_USER });
    mockClient.logout.mockResolvedValue(undefined);
    TestBed.configureTestingModule({ providers: [DevAuth] });
    const auth = TestBed.inject(DevAuth);
    await auth.ready();
    expect(auth.isAuthenticated()).toBe(true);

    await auth.logout();

    expect(mockClient.logout).toHaveBeenCalled();
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.user()).toBeNull();
  });

  it('passes a configured DEV_AUTH_BASE_PATH to the client factory', () => {
    mockClient.getSession.mockResolvedValue({ user: null });
    TestBed.configureTestingModule({
      providers: [
        DevAuth,
        { provide: DEV_AUTH_BASE_PATH, useValue: '/custom/auth' },
      ],
    });

    TestBed.inject(DevAuth);

    expect(createClient).toHaveBeenCalledWith('/custom/auth');
  });

  it('defaults to /api/auth when nothing overrides DEV_AUTH_BASE_PATH', () => {
    mockClient.getSession.mockResolvedValue({ user: null });
    TestBed.configureTestingModule({ providers: [DevAuth] });

    TestBed.inject(DevAuth);

    expect(createClient).toHaveBeenCalledWith('/api/auth');
  });
});
