import {
  Injectable,
  inject,
  signal,
  computed,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { createClient } from '../client/auth-client';
import type { AuthUser } from '../types/auth.types';

@Injectable({
  providedIn: 'root',
})
export class Auth {
  #platformId = inject(PLATFORM_ID);
  #client = createClient();

  #_user = signal<AuthUser | null>(null);
  #_loading = signal(true);

  readonly user = this.#_user.asReadonly();
  readonly loading = this.#_loading.asReadonly();
  readonly isAuthenticated = computed(() => !!this.#_user());

  #sessionReady: Promise<void>;

  constructor() {
    if (isPlatformBrowser(this.#platformId)) {
      this.#sessionReady = this.#loadSession();
    } else {
      this.#_loading.set(false);
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
      this.#_loading.set(false);
    }
  }

  /**
   * Hands the browser to the identity provider (dev-auth) to authenticate.
   *
   * Not a promise: this navigates away. Credentials are never typed into this
   * app — the provider owns them, and it is the only place that knows about
   * GitHub, so email/password and social sign-in stay one flow. The browser
   * comes back to /api/auth/callback, which establishes this app's session and
   * returns it to `returnTo`.
   */
  signIn(returnTo = '/'): void {
    this.#client.signIn(returnTo);
  }

  async updateName(name: string): Promise<void> {
    const { user } = await this.#client.updateUser({ name });
    this.#_user.set(user);
  }

  async logout(): Promise<void> {
    await this.#client.signOut();
    this.#_user.set(null);
  }
}
