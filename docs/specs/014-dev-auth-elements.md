# 014 — DevAuth Elements: framework-agnostic visual SDK

| Field   | Value                       |
| ------- | --------------------------- |
| Status  | Done                        |
| Branch  | `feature/dev-auth-elements` |
| Created | 2026-09-11                  |
| Updated | 2026-09-11                  |

## 1. Summary

`libs/shared/dev-auth-elements` (`@dev-auth/elements`) adds the first
framework-agnostic visual layer to the DevAuth SDK: native Custom Elements
`<dev-auth-sign-in>` and `<dev-auth-user-button>`, built with Flowview for
template authoring (internal-only) and `@andersseen/web-components` for UI
primitives. DevFlare now dogfoods both, replacing hand-rolled Volt markup in
`login.page.ts` and `navbar.component.ts`. `@dev-auth/angular`'s Angular `DevAuth`
service is refactored to sit on top of the same framework-agnostic
`AuthController` this package owns, so an app using both never runs two
independent `/api/auth/session` fetch loops.

## 2. Problem / Motivation

DevAuth's visual auth UI only ever existed as Angular-specific markup: either
hand-rolled in DevFlare's own pages, or (unmerged) in PR #32's
`libs/shared/auth-ui`. Neither is usable from plain HTML, Astro, React, Vue,
or Svelte. The `domain:dev-auth-sdk` bounded context established by spec 013
needed a visual layer that doesn't force every future consumer app onto
Angular.

## 3. Goals & Non-goals

- **Goals**: native Custom Elements for sign-in and the account menu; zero
  Flowview/Angular tooling required of a consumer; one shared session
  controller between Angular and the elements; SSR-safe import; accessible
  by default; dogfooded in DevFlare with the real OAuth flow unchanged.
- **Non-goals**: UserProfile/SignUp/account-settings/org-switcher/MFA
  components; React/Vue/Astro wrapper packages; npm publication (**Superseded
  2026-09-12**, see
  [docs/specs/015-dev-auth-npm-publishing.md](015-dev-auth-npm-publishing.md)
  — reversed once a real `@dev-auth` npm org existed); Imageryx integration;
  new `@andersseen/web-components` primitives; Cloudflare Connect work of any
  kind.

## 4. Design

### Prior art — PR #32

`feature/012-dev-auth-angular-ui` (open, not merged) is real, tested prior
art, mined rather than copied: the identity-fallback algorithms
(trim-and-fallback name→email→generic chain; multi-word name → first+last
initials), the `--dev-auth-*` CSS custom-property theming contract, and the
full accessibility contract (roles, ARIA, focus-in-on-open/focus-restore-on-
close, Arrow/Home/End/Escape, 44px targets, `overflow-wrap:anywhere`,
`prefers-reduced-motion`) all came from there, re-implemented in framework-
agnostic form. Its two Angular-specific dependencies —
`quartz-headless`'s `OverlayTriggerDirective` and `lucide-angular` — have no
direct equivalent and were replaced with native code and
`@andersseen/web-components`'s `and-icon`/`and-skeleton`/`and-button`.

### Auth-controller boundary

`libs/shared/dev-auth-elements/src/lib/controller/auth-controller.ts` owns
`createAuthController()` — the framework-agnostic session client (`fetch`
against this app's own `/api/auth/{session,login,logout,user}`, never OAuth/
token-exchange) that used to live, Angular-entangled, inside `@dev-auth/angular`.
`@dev-auth/angular`'s `DevAuth` service now wraps one `AuthController` (via a new
`DEV_AUTH_CONTROLLER` injection token) instead of fetching itself.
`provideDevAuth({ controller })` accepts a pre-built controller so an app can
hand the same instance to both Angular and the elements — see
`apps/devflare/src/app/app.config.ts`, which builds one controller at module
scope (browser-guarded, alongside the existing Sentry init) and passes it to
both `provideDevAuthElements()` and `provideDevAuth()`.

`dev-auth-elements` does **not** depend on `@dev-auth/core` (the OAuth/
OIDC protocol client) even though the `domain:dev-auth-sdk` Nx boundary would
allow it — that package performs the server-side code exchange and is
deliberately kept out of anything that could end up in a browser bundle.

### Light DOM, not Shadow DOM

Confirmed the brief's hypothesis: `dev-auth-sign-in`/`dev-auth-user-button`
never call `attachShadow`. They're composition/domain components, not
design-system primitives — `@andersseen/web-components` already owns Shadow
DOM for its own primitives regardless of the parent's DOM mode. Light DOM
keeps the `--dev-auth-*` theming contract flowing with no shadow-piercing,
and lets `menu-actions` content be projected with plain DOM operations. Since
these elements have no shadow root, a `<slot>` tag would be inert (`<slot>`
only projects inside an attached shadow root) — `menu-actions` content is
instead captured once at first connect and re-appended into a plain outlet
`<div>` after each re-render (`user-button-element.ts`).

### Menu primitive — verified, not assumed

Read `and-dropdown`'s and `and-menu-list`'s actual compiled source before
building: `and-dropdown`'s panel is entirely generated from its `items`
array (a `trigger` slot only, no body slot for custom content) — it can't
host an identity header, a separator, and a `menu-actions` outlet. `and-menu-
list` in its data-driven `items` mode manages keyboard nav for free, but its
own doc comment says slotted-content mode ("Omit `items` to slot arbitrary
content instead… this component only renders the `<ul>` wrapper and doesn't
manage focus for you") gives up that management — which is required here
for the `menu-actions` extensibility point. So: `and-menu-list` in slotted
mode for `role="menu"` semantics, with open/close/positioning/outside-click/
Escape/roving-`tabindex`/Arrow-Home-End keyboard nav owned by
`user-button-element.ts` (ported from PR #32's already-framework-agnostic
`onMenuKeydown`/`MENU_ITEM_SELECTOR` logic).

### Flowview's actual role

Verified against the sibling `flowview` repo and this repo's real
dependency tree: only `@flowview/compiler` (Node-CJS-only WASM, build-time)
and `@flowview/runtime` (28 lines, `escapeHtml`/`renderValue`, safe
everywhere) are installed or used anywhere in this repo — `@flowview/dom`/
`reactive`/`vite`/`vite-events` are not installed, and `apps/dev-auth` uses
Flowview purely as a server-side string templater. `dev-auth-elements`
reuses that exact pattern client-side: `.flow` → committed `.flow.js`
exporting `render(context): string` (`scripts/compile-flow.mjs`, a direct
port of `apps/dev-auth`'s script, now also emitting a sibling `.flow.d.ts`
since `@dev-auth/angular`'s `declaration: true` typecheck resolves the import
transitively and needs a type for it). Each element assigns the string to
`this.innerHTML` on real state transitions and re-binds native listeners —
never on interactive changes (menu open/close), which stay owned by plain
DOM/CSS so focus and `@andersseen/web-components` primitives' own state are
never torn down mid-interaction. No `@flowview/vite-events`: plain
`addEventListener` is simpler and avoids event-retargeting risk across the
light-DOM/Shadow-DOM boundary with `and-menu-list`'s children.

### SSR safety

Every element's class body is declared inside its `defineDevAuth*()`
registration function, not at module scope — importing `@org/dev-auth-
elements` never touches `HTMLElement`/`document`/`customElements`. Verified
by a dedicated spec (`register.ssr.spec.ts`) that imports the whole package
under Vitest's `node` environment (no DOM globals at all) and asserts it
doesn't throw, plus a real SSR check: `curl http://localhost:4200/` renders
the literal `<dev-auth-user-button>…</dev-auth-user-button>` tag with no
server error.

### Files created/modified

| File                                                                                    | Change                                                                                                                                    |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `libs/shared/dev-auth-elements/**`                                                      | new library (controller, identity helpers, registry, both elements + `.flow` templates, registration, styles, README)                     |
| `libs/shared/dev-auth-angular/src/lib/client/auth-client.ts`, `lib/types/auth.types.ts` | deleted — logic relocated into `dev-auth-elements`'s controller                                                                           |
| `libs/shared/dev-auth-angular/src/lib/services/auth.service.ts`, `lib/tokens.ts`        | rebuilt on `DEV_AUTH_CONTROLLER` / `AuthController`                                                                                       |
| `apps/devflare/src/app/app.config.ts`                                                   | builds the shared controller, registers the elements, passes the controller to `provideDevAuth()`                                         |
| `apps/devflare/src/app/pages/login.page.ts`                                             | Volt sign-in card → `<dev-auth-sign-in>`                                                                                                  |
| `apps/devflare/src/app/components/navbar.component.ts`                                  | Volt avatar/menu → `<dev-auth-user-button>` with a slotted Settings link                                                                  |
| `apps/devflare-e2e/src/auth.spec.ts`                                                    | selectors updated for the new elements; tightened to `role=alert`; added a focus-ring check                                               |
| root `package.json`                                                                     | added `@andersseen/web-components`, `@andersseen/icon` as real dependencies (previously CDN-only, nowhere in this repo's dependency tree) |
| `AGENTS.md`, `tsconfig.base.json`                                                       | Hard Rule #1 + path-alias list extended for the new lib                                                                                   |

### Decisions & trade-offs

- **Icons**: `@andersseen/icon@0.1.1` has no `log-out` icon (confirmed by
  enumerating every exported constant) — the sign-out control is text-only
  rather than inventing one. `and-button`'s `loading` prop already shows its
  own spinner + `aria-busy`, so no custom loading icon was needed for the
  sign-in action either.
- **`data-full` on `and-button`**: mirrors `apps/dev-auth`'s own convention
  (`and-button` has no first-class full-width prop; width goes through
  `::part(button)`).
- **`@andersseen/web-components`/`@andersseen/icon` were not previously an
  npm dependency anywhere in this repo** (only CDN-loaded by `apps/dev-auth`)
  — added as real root dependencies so this library can build against and
  bundle them properly.

## 5. Constraints

Nx boundaries: `dev-auth-elements` tagged `["scope:shared","type:ui","domain:dev-auth-sdk"]`;
`domain:dev-auth-sdk` may only depend on `domain:dev-auth-sdk` (self-contained,
per spec 013) — verified via `nx run devflare:lint` after wiring the app,
which runs `@nx/enforce-module-boundaries`. No `package.json`/build step for
the new lib, consistent with every other `libs/shared/*` package — consumed
via the `@dev-auth/elements` TS path alias.

## 6. Test plan

- Unit (Vitest, `libs/shared/dev-auth-elements`): controller state
  transitions/subscribe/login/logout/updateProfile, identity-fallback
  algorithms, registration idempotency + SSR-safety, both elements' state/
  attribute/slot/event/keyboard/focus/cleanup behavior. 64 tests.
- `@dev-auth/angular`: `auth.service.spec.ts` rewritten against a fake
  `AuthController` injected via `DEV_AUTH_CONTROLLER`. 11 tests.
- `devflare` app: existing 108 unit tests unaffected.
- E2E (`devflare-e2e`, Chromium/Firefox/WebKit): updated `auth.spec.ts`, 21
  tests, run against a live `nx run devflare:serve`.
- Real browser verification (Playwright, manual session, not committed as an
  automated test — dev-auth is not started in CI, matching this suite's
  existing documented constraint): full login → dev-auth hosted form →
  callback → `<dev-auth-user-button>` shows "Account menu for Test User"
  with "TU" initials → menu opens with focus on the first item → Escape
  closes and restores focus to the trigger → Sign out clears the session
  and the element renders empty → `authGuard` correctly redirects a
  protected route back to `/login`. Zero console errors other than a
  pre-existing, unrelated `apps/dev-auth` favicon 404.

## 7. Tasks

- [x] 1. New `libs/shared/dev-auth-elements` library scaffold
- [x] 2. Auth controller + identity helpers, relocated/adapted from `@dev-auth/angular`/PR #32
- [x] 3. `.flow` templates + compiled output for both elements
- [x] 4. `DevAuthSignInElement` / `DevAuthUserButtonElement` + registration
- [x] 5. Refactor `@dev-auth/angular` onto the shared controller
- [x] 6. Dogfood in DevFlare (`app.config.ts`, `login.page.ts`, `navbar.component.ts`)
- [x] 7. Update `devflare-e2e`'s `auth.spec.ts`
- [x] 8. Run quality gates (`pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`, plus `pnpm build`)
- [x] 9. Manual verification (section 6)
- [x] 10. Update `docs/ai/STATE.md` + `docs/ai/ARCHITECTURE.md` + this spec + the index in `docs/specs/README.md`

## 8. Verification results

See section 6. `pnpm check` results and exact commands are recorded in
`docs/ai/STATE.md`'s session-log entry for this work.

## 9. Log / Deviations

- 2026-09-11: `and-dropdown` was the brief's suggested outer shell for the
  account menu; reading its actual compiled source showed it has no slot for
  custom panel content, so the design uses `and-menu-list` (slotted mode) +
  a hand-rolled shell instead — documented above, not merely assumed.
- 2026-09-11: the `--dev-auth-*` token _values_ (not names) are a fresh
  implementation of PR #32's documented contract, not a byte-for-byte port —
  PR #32's actual CSS was read only as a text summary during research, not
  the literal source file.
- 2026-09-11: PR #32 disposition (recommend closing, credit reused concepts)
  is a recommendation for the repo owner, not auto-executed — closing a PR
  is a GitHub-visible action taken only on explicit confirmation.
