import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authGuard, guestGuard } from './auth.guard';
import { DevAuth } from '../services/auth.service';

/**
 * These exercise routing UX only — see the "not a security boundary" note on
 * the guards themselves. `DevAuth` is stubbed directly rather than through a
 * fake session fetch: what's under test here is the guard's branching, not
 * the service it reads from (see auth.service.spec.ts for that).
 */

type Guard = typeof authGuard;

function runGuard(guard: Guard) {
  return TestBed.runInInjectionContext(() =>
    guard({} as Parameters<Guard>[0], {} as Parameters<Guard>[1]),
  );
}

describe('authGuard / guestGuard', () => {
  let isAuthenticated: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    isAuthenticated = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: DevAuth,
          useValue: { ready: () => Promise.resolve(), isAuthenticated },
        },
      ],
    });
  });

  it('authGuard allows an authenticated user through', async () => {
    isAuthenticated.mockReturnValue(true);
    await expect(runGuard(authGuard)).resolves.toBe(true);
  });

  it('authGuard redirects an anonymous user to /login', async () => {
    isAuthenticated.mockReturnValue(false);
    const result = await runGuard(authGuard);
    expect(result).not.toBe(true);
  });

  it('guestGuard allows an anonymous user through', async () => {
    isAuthenticated.mockReturnValue(false);
    await expect(runGuard(guestGuard)).resolves.toBe(true);
  });

  it('guestGuard redirects an authenticated user to /', async () => {
    isAuthenticated.mockReturnValue(true);
    const result = await runGuard(guestGuard);
    expect(result).not.toBe(true);
  });
});
