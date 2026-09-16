import { describe, it, expect } from 'vitest';
import {
  AuthControllerRequestError,
  createAuthController,
  signInUrl,
} from './auth-controller';

describe('auth-controller compatibility re-export', () => {
  it('re-exports the headless client API from @dev-auth/client', () => {
    expect(typeof createAuthController).toBe('function');
    expect(signInUrl('/settings')).toBe('/api/auth/login?returnTo=%2Fsettings');
    expect(
      new AuthControllerRequestError({ code: 'x', message: 'failed' }),
    ).toBeInstanceOf(Error);
  });
});
