import { InjectionToken } from '@angular/core';
import { DEFAULT_BASE_PATH } from './client/auth-client';

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

export interface DevAuthConfig {
  basePath?: string;
}

/** Registers this application's DevAuth Angular adapter. Optional when the
 * defaults (an `/api/auth` session API on this app's own origin) already
 * apply. */
export function provideDevAuth(config: DevAuthConfig = {}) {
  return config.basePath
    ? [{ provide: DEV_AUTH_BASE_PATH, useValue: config.basePath }]
    : [];
}
