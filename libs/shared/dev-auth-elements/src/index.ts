// Registration (browser-only, explicit, idempotent)
export {
  defineDevAuthElements,
  defineDevAuthSignIn,
  defineDevAuthUserButton,
} from './lib/register';

// State — framework-agnostic, safe to import during SSR
export {
  createAuthController,
  signInUrl,
  DEFAULT_BASE_PATH,
} from './lib/controller/auth-controller';
export type {
  AuthController,
  AuthControllerConfig,
  AuthControllerState,
  AuthStatus,
  AuthUser,
} from './lib/controller/auth-controller';
export {
  provideDevAuthElements,
  getDefaultAuthController,
} from './lib/registry';

// Identity-display helpers, exposed in case a consumer wants the same
// fallback rules outside the two elements (e.g. its own nav bar).
export { displayIdentity, initials } from './lib/identity';
