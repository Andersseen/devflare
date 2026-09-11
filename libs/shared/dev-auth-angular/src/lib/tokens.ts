import { InjectionToken, inject } from '@angular/core';
import {
  createAuthController,
  DEFAULT_BASE_PATH,
  type AuthController,
} from '@dev-auth/elements';

/**
 * Base path of this application's own auth routes (session/login/logout/user)
 * — never the identity provider's URL. Defaults to `/api/auth`, which is what
 * every current consumer already mounts its routes at, so `provideDevAuth()`
 * is optional unless an app genuinely needs a different path.
 */
export const DEV_AUTH_BASE_PATH = new InjectionToken<string>(
  'DEV_AUTH_BASE_PATH',
  { factory: () => DEFAULT_BASE_PATH },
);

/**
 * The framework-agnostic session controller `DevAuth` wraps in signals —
 * owned by `@dev-auth/elements` so an app can share one instance between
 * Angular's state and `<dev-auth-sign-in>`/`<dev-auth-user-button>` instead
 * of each independently polling `/session`. Defaults to a fresh controller
 * built from `DEV_AUTH_BASE_PATH`; pass `controller` to `provideDevAuth()`
 * to reuse one built elsewhere.
 */
export const DEV_AUTH_CONTROLLER = new InjectionToken<AuthController>(
  'DEV_AUTH_CONTROLLER',
  {
    factory: () =>
      createAuthController({ basePath: inject(DEV_AUTH_BASE_PATH) }),
  },
);

export interface DevAuthConfig {
  basePath?: string;
  controller?: AuthController;
}

/** Registers this application's DevAuth Angular adapter. Optional when the
 * defaults (an `/api/auth` session API on this app's own origin) already
 * apply. */
export function provideDevAuth(config: DevAuthConfig = {}) {
  const providers = [];
  if (config.basePath) {
    providers.push({ provide: DEV_AUTH_BASE_PATH, useValue: config.basePath });
  }
  if (config.controller) {
    providers.push({
      provide: DEV_AUTH_CONTROLLER,
      useValue: config.controller,
    });
  }
  return providers;
}
