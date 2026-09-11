import { render as renderUserButton } from './user-button.flow.js';
import {
  createAuthController,
  type AuthController,
  type AuthControllerState,
} from '../controller/auth-controller';
import { getDefaultAuthController } from '../registry';
import { displayIdentity, initials } from '../identity';

const MENU_ITEM_SELECTOR =
  '[role="menuitem"]:not([disabled]):not([aria-disabled="true"])';

/**
 * Class body lives inside this factory, not at module scope, so importing
 * this module never touches `HTMLElement` — safe to import during SSR.
 * Call `defineDevAuthUserButton()` (browser-only) to actually register it.
 */
export function createDevAuthUserButtonElement(): CustomElementConstructor {
  return class DevAuthUserButtonElement extends HTMLElement {
    #controller: AuthController | null = null;
    #unsubscribe: (() => void) | null = null;
    #explicitController: AuthController | undefined;
    #menuActionNodes: Element[] | null = null;
    #open = false;
    #outsideClickHandler = (event: MouseEvent): void => {
      if (!(event.target instanceof Node) || !this.contains(event.target)) {
        this.#closeMenu();
      }
    };

    get controller(): AuthController | undefined {
      return this.#explicitController;
    }

    set controller(value: AuthController | undefined) {
      this.#explicitController = value;
      if (this.isConnected) this.#attach(value);
    }

    connectedCallback(): void {
      if (this.#menuActionNodes === null) {
        this.#menuActionNodes = Array.from(
          this.querySelectorAll(':scope > [slot="menu-actions"]'),
        );
      }
      this.#attach(this.#explicitController);
    }

    disconnectedCallback(): void {
      document.removeEventListener('click', this.#outsideClickHandler, true);
      this.#unsubscribe?.();
      this.#unsubscribe = null;
      this.#controller = null;
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
      this.#open = false;
      document.removeEventListener('click', this.#outsideClickHandler, true);

      const user = state.user;
      const identity = displayIdentity(
        user?.name,
        user?.email,
        'signed-in account',
      );
      this.innerHTML = renderUserButton({
        status: state.status,
        identity,
        email: user?.email ?? '',
        image: user?.image ?? '',
        initial: initials(user?.name, user?.email),
        ariaLabel: `Account menu for ${identity}`,
      });

      const outlet = this.querySelector<HTMLElement>(
        '[data-dev-auth-outlet="menu-actions"]',
      );
      if (outlet && this.#menuActionNodes) {
        for (const node of this.#menuActionNodes) outlet.appendChild(node);
      }

      this.dispatchEvent(
        new CustomEvent('dev-auth-state-change', {
          bubbles: true,
          detail: { status: state.status, user: state.user },
        }),
      );

      this.#bindListeners();
    }

    #bindListeners(): void {
      const trigger =
        this.querySelector<HTMLButtonElement>('#dev-auth-trigger');
      const panel = this.querySelector<HTMLElement>('#dev-auth-panel');
      const signOut =
        this.querySelector<HTMLButtonElement>('#dev-auth-signout');
      const logoutError = this.querySelector<HTMLElement>(
        '#dev-auth-logout-error',
      );
      if (!trigger || !panel) return;

      trigger.addEventListener('click', () => {
        if (this.#open) this.#closeMenu();
        else this.#openMenu();
      });

      trigger.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          this.#openMenu();
          this.#focusMenuItem(event.key === 'ArrowDown' ? 'first' : 'last');
        }
      });

      panel.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          this.#closeMenu({ restoreFocus: true });
          return;
        }
        const items = this.#menuItems();
        if (!items.length) return;
        const index = items.indexOf(document.activeElement as HTMLElement);
        let next: number | null = null;
        if (event.key === 'ArrowDown') next = (index + 1) % items.length;
        else if (event.key === 'ArrowUp')
          next = (index - 1 + items.length) % items.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = items.length - 1;
        if (next === null) return;
        event.preventDefault();
        items[next]?.focus();
      });

      this.addEventListener('focusout', (event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !this.contains(next)) {
          this.#closeMenu();
        }
      });

      signOut?.addEventListener('click', async () => {
        const controller = this.#controller;
        if (!controller || signOut.disabled) return;

        signOut.disabled = true;
        if (logoutError) logoutError.hidden = true;

        try {
          await controller.logout();
          this.dispatchEvent(
            new CustomEvent('dev-auth-logout', { bubbles: true }),
          );
          this.#closeMenu({ restoreFocus: true });
        } catch {
          signOut.disabled = false;
          if (logoutError) logoutError.hidden = false;
        }
      });

      // Close the menu when a slotted consumer action is chosen, matching
      // how a native menu dismisses on selection (their own click handling —
      // e.g. router navigation — still runs first via normal bubbling).
      panel.addEventListener('click', (event) => {
        const target = (event.target as Element | null)?.closest(
          MENU_ITEM_SELECTOR,
        );
        if (target && target !== signOut) this.#closeMenu();
      });
    }

    /**
     * Roving tabindex: every menu item (ours, and anything a consumer slots
     * into `menu-actions`) gets `tabindex="-1"` so it is reachable via our
     * own `.focus()` calls regardless of whether the underlying element
     * (e.g. an `<a>` without `href`) is natively focusable, while staying
     * out of the page's normal Tab order — Arrow/Home/End own movement
     * inside an open menu, not Tab.
     */
    #menuItems(): HTMLElement[] {
      const panel = this.querySelector('#dev-auth-panel');
      const items = panel
        ? Array.from(panel.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR))
        : [];
      for (const item of items) {
        if (!item.hasAttribute('tabindex')) item.tabIndex = -1;
      }
      return items;
    }

    #focusMenuItem(which: 'first' | 'last'): void {
      const items = this.#menuItems();
      const item = which === 'first' ? items[0] : items.at(-1);
      (item as HTMLElement | undefined)?.focus();
    }

    #openMenu(): void {
      const trigger = this.querySelector('#dev-auth-trigger');
      const panel = this.querySelector<HTMLElement>('#dev-auth-panel');
      if (!trigger || !panel) return;
      this.#open = true;
      panel.style.display = '';
      trigger.setAttribute('aria-expanded', 'true');
      document.addEventListener('click', this.#outsideClickHandler, true);
      queueMicrotask(() => this.#focusMenuItem('first'));
    }

    #closeMenu(options: { restoreFocus?: boolean } = {}): void {
      if (!this.#open) return;
      const trigger = this.querySelector<HTMLElement>('#dev-auth-trigger');
      const panel = this.querySelector<HTMLElement>('#dev-auth-panel');
      this.#open = false;
      document.removeEventListener('click', this.#outsideClickHandler, true);
      if (panel) panel.style.display = 'none';
      trigger?.setAttribute('aria-expanded', 'false');
      if (options.restoreFocus) trigger?.focus();
    }
  };
}
