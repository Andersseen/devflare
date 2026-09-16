import { vi } from 'vitest';
import type {
  AuthController,
  AuthControllerState,
  AuthUser,
} from '@dev-auth/client';

/**
 * A hand-driven `AuthController` double for element tests — no fetch, no
 * timers. Tests push state transitions with `setState` and assert on what
 * the element rendered/dispatched in response.
 */
export function createFakeController(
  initial: Partial<AuthControllerState> = {},
): {
  controller: AuthController;
  setState: (next: Partial<AuthControllerState>) => void;
} {
  let state: AuthControllerState = {
    status: 'loading',
    user: null,
    error: null,
    ...initial,
  };
  const listeners = new Set<(state: AuthControllerState) => void>();

  function setState(next: Partial<AuthControllerState>): void {
    state = { user: null, error: null, ...next } as AuthControllerState;
    for (const listener of Array.from(listeners)) listener(state);
  }

  const controller: AuthController = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    ready: () => Promise.resolve(),
    login: vi.fn(),
    logout: vi.fn(async () => undefined),
    updateProfile: vi.fn(async () => undefined),
    refresh: vi.fn(async () => undefined),
    dispose: vi.fn(),
  };

  return { controller, setState };
}

export const TEST_USER: AuthUser = {
  id: 'u1',
  email: 'andrii@example.com',
  name: 'Andrii Pap',
  image: null,
  emailVerified: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};
