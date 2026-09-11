import { render as renderSignIn } from './sign-in.flow.js';
import {
  createAuthController,
  type AuthController,
  type AuthControllerState,
} from '../controller/auth-controller';
import { getDefaultAuthController } from '../registry';
import { displayIdentity, initials } from '../identity';

const OBSERVED_ATTRIBUTES = [
  'heading',
  'description',
  'action-label',
  'return-to',
  'error-message',
] as const;

/**
 * `returnTo` is a path on *this app*; an absolute URL or a protocol-relative
 * one here would be an open redirect, so anything that doesn't look like a
 * same-origin path collapses to '/'. Deliberately not imported from
 * `@org/dev-auth-core` (which has an equivalent `safeReturnTo`) — this
 * package must not depend on the OAuth/token-exchange package at all.
 */
function sanitizeReturnTo(value: string | null): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return '/';
  return trimmed;
}

type AndButtonLike = HTMLElement & { loading: boolean };

/**
 * Class body lives inside this factory, not at module scope, so importing
 * this module never touches `HTMLElement` — safe to import during SSR.
 * Call `defineDevAuthSignIn()` (browser-only) to actually register it.
 */
export function createDevAuthSignInElement(): CustomElementConstructor {
  return class DevAuthSignInElement extends HTMLElement {
    static get observedAttributes(): readonly string[] {
      return OBSERVED_ATTRIBUTES;
    }

    #controller: AuthController | null = null;
    #unsubscribe: (() => void) | null = null;
    #explicitController: AuthController | undefined;
    #redirecting = false;

    /** Explicit controller injection (state-sharing without a global default). */
    get controller(): AuthController | undefined {
      return this.#explicitController;
    }

    set controller(value: AuthController | undefined) {
      this.#explicitController = value;
      if (this.isConnected) this.#attach(value);
    }

    connectedCallback(): void {
      this.#attach(this.#explicitController);
    }

    disconnectedCallback(): void {
      this.#unsubscribe?.();
      this.#unsubscribe = null;
      this.#controller = null;
    }

    attributeChangedCallback(): void {
      if (!this.#controller) return;
      this.#render(this.#controller.getState());
    }

    #attach(explicit: AuthController | undefined): void {
      this.#unsubscribe?.();
      const controller =
        explicit ?? getDefaultAuthController() ?? createAuthController();
      this.#controller = controller;
      this.#render(controller.getState());
      this.#unsubscribe = controller.subscribe((state) => this.#render(state));
    }

    #render(state: AuthControllerState): void {
      const user = state.user;
      this.innerHTML = renderSignIn({
        status: state.status,
        heading: this.getAttribute('heading') ?? 'Sign in',
        description:
          this.getAttribute('description') ?? 'Continue to your account.',
        actionLabel:
          this.getAttribute('action-label') ?? 'Continue with DevAuth',
        errorMessage: this.getAttribute('error-message') ?? '',
        identity: displayIdentity(user?.name, user?.email),
        initial: initials(user?.name, user?.email) || '?',
      });
      this.#bindListeners();
    }

    #bindListeners(): void {
      const button = this.querySelector<AndButtonLike>('#dev-auth-action');
      const errorEl = this.querySelector<HTMLElement>('#dev-auth-action-error');
      if (!button) return;

      button.addEventListener('click', () => {
        const controller = this.#controller;
        if (this.#redirecting || !controller) return;

        this.#redirecting = true;
        button.loading = true;
        this.dispatchEvent(
          new CustomEvent('dev-auth-login', { bubbles: true }),
        );

        try {
          controller.login(sanitizeReturnTo(this.getAttribute('return-to')));
        } catch {
          // login() only throws synchronously (it navigates on success, so
          // there is nothing to await) — surface it and let the visitor retry.
          this.#redirecting = false;
          button.loading = false;
          if (errorEl) {
            errorEl.hidden = false;
            errorEl.textContent = 'Could not start sign-in. Please try again.';
          }
        }
      });
    }
  };
}
