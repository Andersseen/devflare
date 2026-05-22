import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { Auth } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  const router = inject(Router);

  if (auth.isAuthenticated()) return true;
  return router.createUrlTree(['/login']);
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  const router = inject(Router);

  if (!auth.isAuthenticated()) return true;
  return router.createUrlTree(['/']);
};
