# @dev-auth/elements

Framework-agnostic visual layer for the DevAuth SDK: native Custom Elements —
`<dev-auth-sign-in>` and `<dev-auth-user-button>` — usable from plain HTML,
Astro, React, Vue, Svelte, or Angular. No Angular, no Flowview tooling, and no
OAuth/token-exchange logic is required (or exposed) to consume them.

```text
DevAuth Core        framework-independent OAuth/OIDC protocol client (server-side)
DevAuth Angular      Angular DI/signals adapter over this package's controller (@dev-auth/angular)
DevAuth Elements     this package — optional, framework-independent visual Custom Elements
```

## Install

**Outside this monorepo:** `pnpm add @dev-auth/elements` (or npm/yarn). Pulls
in `@andersseen/web-components` and `@andersseen/icon` as real dependencies.

The stylesheet (`tokens.css`) loads itself automatically the first time you
call `defineDevAuthSignIn()`/`defineDevAuthUserButton()`/`defineDevAuthElements()`
in a real browser — a lazy `import()`, which every mainstream bundler (Vite,
webpack, esbuild-based setups) handles the same as a static CSS import. If
your setup has no bundler at all (a bare `<script type="module">` loading
straight from a CDN/`node_modules`), import the stylesheet yourself instead:
`import '@dev-auth/elements/tokens.css'`, or a plain `<link rel="stylesheet"
href=".../node_modules/@dev-auth/elements/styles/tokens.css">`.

**Inside this monorepo:** consumed straight from TypeScript source via the
`@dev-auth/elements` path alias (`tsconfig.base.json`), like every other
`libs/shared/*` package here — nothing to install.

## Vanilla usage

```html
<dev-auth-sign-in return-to="/dashboard"></dev-auth-sign-in>
<dev-auth-user-button></dev-auth-user-button>

<script type="module">
  import { createAuthController, provideDevAuthElements, defineDevAuthElements } from '@dev-auth/elements';

  const auth = createAuthController({ basePath: '/api/auth' });
  provideDevAuthElements(auth); // do this before defineDevAuthElements()
  defineDevAuthElements();
</script>
```

`createAuthController` only ever talks to _this application's own_
`{basePath}/session`, `/login`, `/logout`, `/user` routes — same-origin,
cookie-based. It never sees an OAuth client secret, an authorization code, or
an access token; that exchange happens entirely on your server (see
`@dev-auth/core`), which is a deliberately separate package this one does
not depend on.

## Angular usage

`@dev-auth/angular`'s `DevAuth` service already wraps an `AuthController` from this
package. To share one session-fetch instance between Angular's signals and
these elements in the same app (rather than each polling `/session`
independently), build the controller once and hand it to both:

```ts
// app.config.ts
const controller = typeof window !== 'undefined' ? createAuthController() : undefined;

if (controller) {
  provideDevAuthElements(controller);
  defineDevAuthElements();
}

export const appConfig: ApplicationConfig = {
  providers: [
    // ...
    provideDevAuth(controller ? { controller } : {}),
  ],
};
```

Then use the elements directly in templates (add `schemas: [CUSTOM_ELEMENTS_SCHEMA]`
to any standalone component that embeds them):

```html
<dev-auth-user-button>
  <a slot="menu-actions" role="menuitem" routerLink="/settings">Settings</a>
</dev-auth-user-button>
```

There is no Angular wrapper component here by design — one canonical visual
implementation, reused as-is.

## `<dev-auth-sign-in>`

Not the hosted DevAuth login form — a consumer-side entry point that hands
off to it. Never renders email/password fields.

| Attribute       | Default                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `heading`       | `Sign in`                                                                                                                 |
| `description`   | `Continue to your account.`                                                                                               |
| `action-label`  | `Continue with DevAuth`                                                                                                   |
| `return-to`     | `/` — sanitized to a same-origin path; anything else collapses to `/`                                                     |
| `error-message` | _(empty)_ — the component does no URL/query parsing itself; pass the resolved string after you've read `?error=` yourself |

States: loading (skeleton), anonymous (the action card), authenticated
(shows the current identity instead of a misleading sign-in action — no
button). A synchronous `login()` failure shows an inline retryable error.

Events: `dev-auth-login` (dispatched just before navigating to the login
route).

## `<dev-auth-user-button>`

Renders nothing while anonymous — the host page decides what to show for a
signed-out visitor, same boundary the SignIn card owns for signed-in ones.
While authenticated: an avatar-triggered account menu.

Identity fallback order for the avatar: `image` → initials (first+last for a
multi-word name, first letter for a single word or an email-only identity) →
a generic person icon. Display name falls back the same way, then to
`"signed-in account"`.

Extensibility: a `slot="menu-actions"` for consumer-supplied items (give each
one `role="menuitem"` yourself — this package doesn't own DevFlare- or
app-specific navigation, e.g. Settings/Projects links).

Events: `dev-auth-logout` (after a successful sign-out), `dev-auth-state-change`
(`detail: { status, user }` — never tokens).

Accessibility: `aria-haspopup="menu"`/dynamic `aria-expanded`/`aria-label`;
`role="menu"`/`"menuitem"`/`"separator"`/`"presentation"`; focus moves into
the first item on open and back to the trigger on close (Escape, outside
click, or an item being chosen); Arrow/Home/End navigate with wrapping via a
roving `tabindex="-1"` (so a slotted item without a natural tabindex, e.g. an
`<a>` without `href`, still receives focus); 44px minimum touch targets;
`prefers-reduced-motion` respected; long names/emails wrap instead of
overflowing.

## Architecture notes

**Light DOM, not Shadow DOM.** These are composition/domain components, not
design-system primitives — `@andersseen/web-components` already owns Shadow
DOM for its own primitives (`and-button`, `and-card`, `and-menu-list`,
`and-skeleton`, `and-icon`, all used here) regardless of the parent's own DOM
mode. Light DOM keeps the `--dev-auth-*` custom-property contract and a
consumer's own CSS flowing with no shadow-piercing tricks, and lets
`menu-actions` content be projected with ordinary DOM operations (see below)
rather than through `::slotted()`/composed-event complexity.

**and-button/and-card/etc. get scoped default tokens, not a global import.**
Their Shadow DOM already ships compiled Tailwind utility classes (e.g.
`.bg-primary { background-color: hsl(var(--primary)) }`); only the _values_
need to come from an ancestor via ordinary custom-property inheritance
(which does cross shadow boundaries). An earlier version of this package
imported `@andersseen/web-components/tokens.css` at `:root` for this — which
broke a real consumer, since that stylesheet's `:root { --primary: ...; }`
clobbered the consumer's own same-named tokens app-wide (hex vs. this
library's HSL-triplet format). `src/styles/tokens.css` now defines
and-web-components' own default palette scoped to `dev-auth-sign-in`/
`dev-auth-user-button` instead — visible only to these two elements and
their and-\* children, never leaking to the rest of the page.

**No native `<slot>`.** A `<slot>` element only has projection behavior
inside an attached shadow root, which these elements deliberately don't have.
`menu-actions` content is captured once at first connect
(`querySelectorAll(':scope > [slot="menu-actions"]')`) and re-appended into a
plain outlet `<div>` after each re-render.

**Flowview is internal-only.** `.flow` templates (`src/lib/elements/*.flow`)
compile to committed `*.flow.js` — pure `(context) => string` functions, no
DOM/browser dependency in the compiled output — the same way
`apps/dev-auth`'s hosted pages already do (`scripts/compile-flow.mjs`, ported
here as-is; `pnpm nx run dev-auth-elements:build:flow` to recompile after
editing a `.flow` source). Each element assigns the rendered string to
`this.innerHTML` on real state transitions (loading → anonymous →
authenticated, or an attribute change) and re-binds native listeners —
**not** on interactive changes like menu open/close, which stay owned by
plain DOM/CSS (`style.display`, `aria-*`) so focus, open state, and event
bindings on `@andersseen/web-components` primitives are never torn down
mid-interaction. `@flowview/dom`/`@flowview/reactive`/`@flowview/vite*`
aren't used — they aren't installed anywhere in this repo, and this
string-render-and-assign pattern already covers what's needed. A consumer of
this package needs none of this — it imports plain compiled JS.

**No Flowview Events.** Delegated event binding across a light-DOM host with
`@andersseen/web-components`' own Shadow DOM children adds event-retargeting
risk for no real benefit here; plain `addEventListener` inside the element
class is simpler and more predictable.

**SSR-safe by construction.** Every element's class body is declared inside
its `defineDevAuth*()` registration function, not at module scope, so
importing this package never touches `HTMLElement`/`document`/`customElements`.
Registration is idempotent and explicit — nothing is auto-registered merely
by importing the package.

## Non-goals (this phase)

No UserProfile/SignUp/account-settings/org-switcher/MFA components, no React/
Vue/Astro wrappers, no new `@andersseen/web-components`
primitives (there is no `and-avatar` — confirmed absent, not reimplemented
here either).
