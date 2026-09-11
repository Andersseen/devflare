import { describe, it, expect, vi } from 'vitest';
import { provideDevAuthElements, getDefaultAuthController } from './registry';
import type { AuthController } from './controller/auth-controller';

function fakeController(): AuthController {
  return {
    getState: () => ({ status: 'anonymous', user: null }),
    subscribe: vi.fn(() => () => undefined),
    ready: () => Promise.resolve(),
    login: vi.fn(),
    logout: vi.fn(),
    updateProfile: vi.fn(),
    refresh: vi.fn(),
  };
}

describe('provideDevAuthElements / getDefaultAuthController', () => {
  it('has no default controller until one is provided', async () => {
    vi.resetModules();
    const fresh = await import('./registry');
    expect(fresh.getDefaultAuthController()).toBeUndefined();
  });

  it('returns the controller passed to provideDevAuthElements', () => {
    const controller = fakeController();
    provideDevAuthElements(controller);

    expect(getDefaultAuthController()).toBe(controller);
  });

  it('the most recent call wins', () => {
    const first = fakeController();
    const second = fakeController();

    provideDevAuthElements(first);
    provideDevAuthElements(second);

    expect(getDefaultAuthController()).toBe(second);
  });
});
