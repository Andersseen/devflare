import type { AuthController } from './controller/auth-controller';

/**
 * Holds the default `AuthController` that `<dev-auth-sign-in>` and
 * `<dev-auth-user-button>` instances use when they aren't handed one
 * explicitly (via their `.controller` property).
 *
 * This is what lets an app share one session-fetch instance between its own
 * framework adapter (e.g. `@org/auth`'s Angular `DevAuth` service) and these
 * elements, instead of each independently polling the session endpoint —
 * call this once, with the same controller the framework adapter uses,
 * before any `<dev-auth-*>` element connects.
 */
let defaultController: AuthController | undefined;

export function provideDevAuthElements(controller: AuthController): void {
  defaultController = controller;
}

export function getDefaultAuthController(): AuthController | undefined {
  return defaultController;
}
