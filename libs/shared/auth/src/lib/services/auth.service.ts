import {
  Injectable,
  inject,
  signal,
  computed,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { createClient } from '../client/auth-client';
import { DEV_AUTH_BASE_PATH } from '../tokens';
import type { AuthUser } from '../types/auth.types';

/**
 * DevAuth's Angular adapter: application auth state as signals, backed by
 * this app's own session endpoints (see `../client/auth-client`).
 *
 * This is deliberately not an OAuth/OIDC client — it never sees a client
 * secret, an access token, or an authorization code. Those belong to the
 * server-side flow in @org/dev-auth-core; by the time the browser can inject
 * `DevAuth`, that flow has already run and left behind only this app's own
 * cookie session.
 */
@Injectable({
  providedIn: 'root',
})
export class DevAuth {
  #platformId = inject(PLATFORM_ID);
  #client = createClient(inject(DEV_AUTH_BASE_PATH));

  #_user = signal<AuthUser | null>(null);
  #_isLoading = signal(true);

  readonly user = this.#_user.asReadonly();
  readonly isLoading = this.#_isLoading.asReadonly();
  readonly isAuthenticated = computed(() => !!this.#_user());

  #sessionReady: Promise<void>;

  constructor() {
    if (isPlatformBrowser(this.#platformId)) {
      this.#sessionReady = this.#loadSession();
    } else {
      this.#_isLoading.set(false);
      this.#sessionReady = Promise.resolve();
    }
  }

  /**
   * Resolves once the initial session lookup has settled. Anything that reads
   * `isAuthenticated()` to make a decision (route guards) must await this
   * first, otherwise it sees `false` for a logged-in user on a hard reload.
   */
  ready(): Promise<void> {
    return this.#sessionReady;
  }

  async #loadSession(): Promise<void> {
    try {
      const { user } = await this.#client.getSession();
      this.#_user.set(user);
    } catch {
      this.#_user.set(null);
    } finally {
      this.#_isLoading.set(false);
    }
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
    this.#client.login(returnTo);
  }

  async updateName(name: string): Promise<void> {
    const { user } = await this.#client.updateUser({ name });
    this.#_user.set(user);
  }

  async logout(): Promise<void> {
    await this.#client.logout();
    this.#_user.set(null);
  }
}
