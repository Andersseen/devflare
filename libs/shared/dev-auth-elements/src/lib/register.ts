import '../styles/tokens.css';
import '@andersseen/web-components/tokens.css';
import {
  defineAndButton,
  defineAndCard,
  defineAndCardContent,
  defineAndCardDescription,
  defineAndCardHeader,
  defineAndCardTitle,
  defineAndIcon,
  defineAndMenuList,
  defineAndSkeleton,
} from '@andersseen/web-components';
import { registerIcons, EXTERNAL_LINK, USER } from '@andersseen/icon';
import { createDevAuthSignInElement } from './elements/sign-in-element';
import { createDevAuthUserButtonElement } from './elements/user-button-element';

const SIGN_IN_TAG = 'dev-auth-sign-in';
const USER_BUTTON_TAG = 'dev-auth-user-button';

/**
 * True only in a real browser: this whole module — including the .flow
 * templates it renders and the auth controller it talks to — is safe to
 * *import* under SSR (no module-scope DOM globals), but every `define*`
 * export here still needs this guard before it touches `customElements`.
 */
function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof customElements !== 'undefined';
}

let iconsRegistered = false;
function ensureIcons(): void {
  if (iconsRegistered) return;
  registerIcons({ 'external-link': EXTERNAL_LINK, user: USER });
  iconsRegistered = true;
}

let primitivesRegistered = false;
function ensurePrimitives(): void {
  if (primitivesRegistered) return;
  defineAndButton();
  defineAndCard();
  defineAndCardHeader();
  defineAndCardTitle();
  defineAndCardDescription();
  defineAndCardContent();
  defineAndIcon();
  defineAndMenuList();
  defineAndSkeleton();
  primitivesRegistered = true;
}

/** Registers `<dev-auth-sign-in>`. Safe to call more than once; no-ops outside a browser. */
export function defineDevAuthSignIn(): void {
  if (!isBrowser()) return;
  ensureIcons();
  ensurePrimitives();
  if (!customElements.get(SIGN_IN_TAG)) {
    customElements.define(SIGN_IN_TAG, createDevAuthSignInElement());
  }
}

/** Registers `<dev-auth-user-button>`. Safe to call more than once; no-ops outside a browser. */
export function defineDevAuthUserButton(): void {
  if (!isBrowser()) return;
  ensureIcons();
  ensurePrimitives();
  if (!customElements.get(USER_BUTTON_TAG)) {
    customElements.define(USER_BUTTON_TAG, createDevAuthUserButtonElement());
  }
}

/** Registers both DevAuth Elements. Safe to call more than once; no-ops outside a browser. */
export function defineDevAuthElements(): void {
  defineDevAuthSignIn();
  defineDevAuthUserButton();
}
