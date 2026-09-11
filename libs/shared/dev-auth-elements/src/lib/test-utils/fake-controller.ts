import { vi } from 'vitest';
import type {
  AuthController,
  AuthControllerState,
  AuthUser,
} from '../controller/auth-controller';

/**
 * A hand-driven `AuthController` double for element tests — no fetch, no
 * timers. Tests push state transitions with `setState` and assert on what
 * the element rendered/dispatched in response.
 */
export function createFakeController(
  initial: AuthControllerState = { status: 'loading', user: null },
): {
  controller: AuthController;
  setState: (next: AuthControllerState) => void;
} {
  let state = initial;
  const listeners = new Set<(state: AuthControllerState) => void>();

  function setState(next: AuthControllerState): void {
    state = next;
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
