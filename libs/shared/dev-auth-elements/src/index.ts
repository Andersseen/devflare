// Registration (browser-only, explicit, idempotent)
export {
  defineDevAuthElements,
  defineDevAuthSignIn,
  defineDevAuthUserButton,
} from './lib/register.js';

// State — re-exported for compatibility. New headless consumers should import
// these from @dev-auth/client to avoid installing visual dependencies.
export {
  AuthControllerRequestError,
  createAuthController,
  safeReturnTo,
  signInUrl,
  DEFAULT_BASE_PATH,
} from '@dev-auth/client';
export type {
  AuthController,
  AuthControllerConfig,
  AuthControllerError,
  AuthControllerState,
  AuthStatus,
  AuthUser,
  AuthUserWire,
} from '@dev-auth/client';
export {
  provideDevAuthElements,
  getDefaultAuthController,
} from './lib/registry.js';

// Identity-display helpers, exposed in case a consumer wants the same
// fallback rules outside the two elements (e.g. its own nav bar).
export { displayIdentity, initials } from './lib/identity.js';
