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

let stylesInjected = false;
function ensureStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  // Dynamic, not a static top-level import: this makes the CSS load a
  // side effect of actually registering an element in a real browser,
  // never of merely importing the package. A static side-effect import
  // resolves silently even when unresolvable (tsc doesn't flag it — no
  // TS2307 — and the existing SSR spec's Vite-based test runner masks it
  // too), so a plain Node/Worker import of the published package would
  // otherwise hard-throw on this line the moment a real bundler-free
  // consumer tried it. `@ts-ignore`, not `@ts-expect-error`: whether this
  // resolves depends on the *consumer's* tsconfig (e.g. devflare's own
  // Vite `types` already declare `*.css` ambiently, so there IS no error
  // to expect there, but dev-auth-elements'/dev-auth-angular's isolated
  // tsconfigs have no such declaration and do error) — `@ts-expect-error`
  // would itself fail as an "unused directive" in the former case.
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- see above: @ts-expect-error can't be used here since some consumers' tsconfigs genuinely have no error to expect.
  // @ts-ignore
  void import('../styles/tokens.css');
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
  ensureStyles();
  ensureIcons();
  ensurePrimitives();
  if (!customElements.get(SIGN_IN_TAG)) {
    customElements.define(SIGN_IN_TAG, createDevAuthSignInElement());
  }
}

/** Registers `<dev-auth-user-button>`. Safe to call more than once; no-ops outside a browser. */
export function defineDevAuthUserButton(): void {
  if (!isBrowser()) return;
  ensureStyles();
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
