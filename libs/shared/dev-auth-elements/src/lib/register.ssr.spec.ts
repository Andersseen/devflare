// @vitest-environment node
import { describe, it, expect } from 'vitest';

describe('SSR safety', () => {
  it('importing the package does not throw without DOM globals', async () => {
    expect(typeof window).toBe('undefined');
    expect(typeof HTMLElement).toBe('undefined');

    await expect(import('../index')).resolves.toBeTruthy();
  });

  it('calling define* without a browser environment is a safe no-op', async () => {
    const {
      defineDevAuthElements,
      defineDevAuthSignIn,
      defineDevAuthUserButton,
    } = await import('./register');

    expect(() => {
      defineDevAuthElements();
      defineDevAuthSignIn();
      defineDevAuthUserButton();
    }).not.toThrow();
  });

  it('createAuthController does not throw without a browser environment', async () => {
    const { createAuthController } = await import(
      './controller/auth-controller'
    );

    expect(() => createAuthController()).not.toThrow();
  });
});
