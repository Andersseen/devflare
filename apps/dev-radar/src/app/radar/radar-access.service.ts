import {
  Injectable,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DEV_AUTH_CONTROLLER, DevAuth } from '@dev-auth/angular';
import {
  defineDevAuthElements,
  provideDevAuthElements,
} from '@dev-auth/elements';
import { ApiError, apiRequest } from './api';

export type AccessState =
  | 'loading'
  | 'anonymous'
  | 'denied'
  | 'allowed'
  | 'error';

/**
 * The one place DevRadar touches DevAuth in the browser. The whole app sits
 * behind it: the shell renders nothing but this state until it is `allowed`.
 *
 * Authorization is decided by the server (`GET /api/v1/access`, and again on
 * every dashboard endpoint); this only picks which state to render.
 */
@Injectable({ providedIn: 'root' })
export class RadarAccess {
  readonly #auth = inject(DevAuth);
  readonly #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly #allowed = signal<boolean | null>(null);
  readonly #failed = signal(false);

  readonly user = this.#auth.user;

  readonly state = computed<AccessState>(() => {
    if (this.#failed()) return 'error';
    if (this.#auth.isLoading()) return 'loading';
    if (!this.#auth.isAuthenticated()) return 'anonymous';
    const allowed = this.#allowed();
    if (allowed === null) return 'loading';
    return allowed ? 'allowed' : 'denied';
  });

  constructor() {
    if (this.#isBrowser) {
      // Same controller as the Angular adapter: one /api/auth/session loop.
      provideDevAuthElements(inject(DEV_AUTH_CONTROLLER));
      defineDevAuthElements();
    }
  }

  async refresh(): Promise<void> {
    if (!this.#isBrowser) return;
    this.#failed.set(false);
    await this.#auth.ready();
    if (!this.#auth.isAuthenticated()) {
      this.#allowed.set(null);
      return;
    }
    try {
      const access = await apiRequest<{ allowed: boolean }>('/api/v1/access');
      this.#allowed.set(access.allowed);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        this.#allowed.set(null);
        return;
      }
      this.#failed.set(true);
    }
  }

  /** A later request came back 401/403 — re-evaluate. */
  handleAccessError(error: unknown): boolean {
    if (!(error instanceof ApiError)) return false;
    if (error.status === 403) {
      this.#allowed.set(false);
      return true;
    }
    if (error.status === 401) {
      void this.refresh();
      return true;
    }
    return false;
  }
}
