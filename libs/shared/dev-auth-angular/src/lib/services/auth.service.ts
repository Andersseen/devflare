import {
  Injectable,
  inject,
  signal,
  computed,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type {
  AuthControllerError,
  AuthControllerState,
  AuthStatus,
  AuthUser,
} from '@dev-auth/client';
import { DEV_AUTH_CONTROLLER } from '../tokens';

/**
 * DevAuth's Angular adapter: application auth state as signals, layered over
 * the framework-agnostic `AuthController` from `@dev-auth/client` (see
 * `DEV_AUTH_CONTROLLER` in `../tokens`) rather than fetching the session
 * itself — the same controller instance can be shared with
 * `<dev-auth-sign-in>`/`<dev-auth-user-button>` via `provideDevAuth({ controller })`
 * so an app never runs two independent session-fetch loops.
 *
 * This is deliberately not an OAuth/OIDC client — it never sees a client
 * secret, an access token, or an authorization code. Those belong to the
 * server-side flow in @dev-auth/core; by the time the browser can inject
 * `DevAuth`, that flow has already run and left behind only this app's own
 * cookie session.
 */
@Injectable({
  providedIn: 'root',
})
export class DevAuth {
  #platformId = inject(PLATFORM_ID);
  #controller = inject(DEV_AUTH_CONTROLLER);

  #_user = signal<AuthUser | null>(null);
  #_isLoading = signal(true);
  #_status = signal<AuthStatus>('loading');
  #_error = signal<AuthControllerError | null>(null);

  readonly user = this.#_user.asReadonly();
  readonly isLoading = this.#_isLoading.asReadonly();
  readonly status = this.#_status.asReadonly();
  readonly error = this.#_error.asReadonly();
  readonly isAuthenticated = computed(() => !!this.#_user());

  #sessionReady: Promise<void>;

  constructor() {
    if (isPlatformBrowser(this.#platformId)) {
      this.#applyState(this.#controller.getState());
      this.#controller.subscribe((state) => this.#applyState(state));
      this.#sessionReady = this.#controller.ready();
    } else {
      this.#_status.set('anonymous');
      this.#_isLoading.set(false);
      this.#sessionReady = Promise.resolve();
    }
  }

  #applyState(state: AuthControllerState): void {
    this.#_user.set(state.user);
    this.#_status.set(state.status);
    this.#_error.set(state.error);
    this.#_isLoading.set(state.status === 'loading');
  }

  /**
   * Resolves once the initial session lookup has settled. Anything that reads
   * `isAuthenticated()` to make a decision (route guards) must await this
   * first, otherwise it sees `false` for a logged-in user on a hard reload.
   */
  ready(): Promise<void> {
    return this.#sessionReady;
  }

  /**
   * Hands the browser to the identity provider (dev-auth) to authenticate.
   *
   * Not a promise: this navigates away. Credentials are never typed into this
   * app — the provider owns them, and it is the only place that knows about
   * GitHub, so email/password and social sign-in stay one flow. The browser
   * comes back to this app's callback route, which establishes the session and
   * returns it to `returnTo`.
   */
  login(returnTo = '/'): void {
    this.#controller.login(returnTo);
  }

  async updateName(name: string): Promise<void> {
    await this.#controller.updateProfile({ name });
  }

  async logout(): Promise<void> {
    await this.#controller.logout();
  }
}
