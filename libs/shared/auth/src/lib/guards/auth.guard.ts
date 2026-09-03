import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, type CanActivateFn } from '@angular/router';
import { DevAuth } from '../services/auth.service';

/**
 * UX only, not a security boundary: this runs in the browser and only decides
 * which route the SPA renders. Every server route this app protects must
 * independently call `requireAuth(getAppSession(event))` — a guard here never
 * substitutes for that check.
 *
 * Both guards resolve every `inject()` before the first `await` — the
 * injection context only lives for the synchronous part of the call.
 */

export const authGuard: CanActivateFn = async () => {
  const auth = inject(DevAuth);
  const router = inject(Router);
  const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  // The session cookie never reaches this injector during SSR, so checking
  // here would bounce every request to /login. Render the shell and let the
  // browser run the real check after hydration.
  if (!isBrowser) return true;

  await auth.ready();
  if (auth.isAuthenticated()) return true;
  return router.createUrlTree(['/login']);
};

export const guestGuard: CanActivateFn = async () => {
  const auth = inject(DevAuth);
  const router = inject(Router);
  const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  if (!isBrowser) return true;

  await auth.ready();
  if (!auth.isAuthenticated()) return true;
  return router.createUrlTree(['/']);
};
