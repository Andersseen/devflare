# 012 — DevAuth Angular UI

| Field   | Value                             |
| ------- | --------------------------------- |
| Status  | Done                              |
| Branch  | `feature/012-dev-auth-angular-ui` |
| Created | 2026-09-04                        |
| Updated | 2026-09-04                        |

## 1. Summary

Add an optional Angular UI library for DevAuth with production-quality
`DevAuthSignIn` and `DevAuthUserButton` standalone components. DevFlare will
dogfood both components without changing its OAuth/OIDC or app-session behavior.

## 2. Problem / Motivation

DevAuth already provides a standards-based provider, a framework-neutral consumer
client, and the signals-first `@org/auth` Angular adapter. Angular consumers still
have to recreate the same sign-in hand-off and current-user menu. A small optional
UI layer removes that repetition while preserving each lower-level integration
choice and keeping credentials and OAuth protocol logic out of browser components.

## 3. Goals & Non-goals

- **Goals**: provide standalone, zoneless-compatible `DevAuthSignIn` and
  `DevAuthUserButton` components that consume only `DevAuth` from `@org/auth`.
- **Goals**: cover loading, anonymous, authenticated, failure, incomplete identity,
  long content, keyboard, focus, reduced-motion, and SSR behavior.
- **Goals**: expose a deliberately small input API and CSS custom-property surface;
  support projected application-specific menu actions in `DevAuthUserButton`.
- **Goals**: replace DevFlare's duplicated login hand-off and navbar identity/logout
  UI, then verify the real provider round trip and logout.
- **Goals**: document the optional layering and assess future package publication
  readiness without publishing.
- **Non-goals**: provider-hosted Flow pages, SignUp, UserProfile, account management,
  organizations/teams/RBAC, MFA/passkeys/magic links, new identity providers,
  Cloudflare auth/resource access, non-Angular SDKs, a theming engine, Storybook,
  package publication, or non-DevAuth DevFlare work.

## 4. Design

### Package boundary

Create `libs/shared/auth-ui`, exposed as `@org/auth-ui`. A dedicated library keeps
the visual layer optional and gives Nx an enforceable dependency direction:

```text
@org/dev-auth-core <- @org/auth <- @org/auth-ui <- consumer app
```

Putting components in `@org/auth` would make a headless Angular consumer import a
package that also owns UI dependencies and styling. A secondary entry point would
solve import ergonomics but not establish a clear Nx project boundary, while this
workspace does not yet build Angular libraries as independently published npm
packages. The new library follows the existing source-alias convention; publication
metadata is explicitly deferred.

### Sign-in component

`<dev-auth-sign-in>` renders a compact, self-contained authentication surface.
Inputs are `title`, `description`, `actionLabel`, `returnTo`, and `errorMessage`,
all signal inputs with useful defaults. Anonymous users can call
`DevAuth.login(returnTo)` once; the
button becomes busy and disabled while navigation begins. Loading renders a stable,
labelled status. Authenticated users see their best available display identity and
no misleading sign-in action. A synchronous login exception is surfaced through an
accessible local error message; provider/callback errors remain consumer-owned and
can be supplied through `description` rather than coupling the component to a
particular router/query format.

### User button

`<dev-auth-user-button>` renders nothing actionable for anonymous users and a
stable loading placeholder while auth resolves. For an authenticated user it shows
an image when present, otherwise initials derived from name/email, otherwise a
generic user icon. Its labelled native trigger opens a Quartz overlay containing
the available name/email, a projected application-actions slot, and a sign-out
button that delegates to `DevAuth.logout()`.

Quartz `OverlayTriggerDirective` owns portal positioning, outside-click handling,
Escape dismissal, and SSR-safe DOM attachment. The component adds menu semantics,
initial focus, ArrowUp/ArrowDown/Home/End navigation among menu items, Escape focus
restoration, and restoration after item activation. Logout has pending and error
states. Projected actions use normal `<ng-content select="[devAuthUserMenuActions]">`
composition; the consumer owns their routing and labels.

### Styling and public API

Both components use encapsulated component CSS, semantic CSS custom properties,
inherited fonts/colors, visible `:focus-visible` treatment, 44px minimum touch
targets, bounded responsive sizing, text wrapping, and `prefers-reduced-motion`.
They do not import DevFlare's Tailwind theme or global styles. Public exports are
only `DevAuthSignIn` and `DevAuthUserButton` from `@org/auth-ui`; implementation
helpers stay private. No additional `Authenticated`/`Unauthenticated` wrappers are
added because the existing signals already make those branches trivial.

### Files

| File                                                                  | Change                                                                                         |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `libs/shared/auth-ui/project.json` and TypeScript/Vite/ESLint configs | Add an Nx Angular UI library matching `libs/shared/auth` conventions.                          |
| `libs/shared/auth-ui/src/index.ts`                                    | Export only the two public components.                                                         |
| `libs/shared/auth-ui/src/lib/sign-in.component.ts`                    | Add the reusable sign-in state surface and action.                                             |
| `libs/shared/auth-ui/src/lib/sign-in.component.spec.ts`               | Test rendering, action, inputs, failure, keyboard activation, and SSR-safe construction.       |
| `libs/shared/auth-ui/src/lib/user-button.component.ts`                | Add identity fallback, Quartz menu, projected actions, and logout.                             |
| `libs/shared/auth-ui/src/lib/user-button.component.spec.ts`           | Test identity states, image/fallbacks, menu/focus/keyboard, logout, and SSR-safe construction. |
| `libs/shared/auth-ui/README.md`                                       | Document optional layering, usage, customization, and publication-readiness gaps.              |
| `tsconfig.base.json`                                                  | Add the `@org/auth-ui` source alias.                                                           |
| `apps/devflare/src/app/pages/login.page.ts`                           | Retain DevFlare branding/error mapping and delegate the auth surface to `DevAuthSignIn`.       |
| `apps/devflare/src/app/components/navbar.component.ts`                | Replace identity/logout duplication with `DevAuthUserButton`; retain app navigation ownership. |
| `apps/devflare-e2e/src/auth.spec.ts`                                  | Update selectors and cover the reusable UI at the consumer boundary.                           |
| `docs/specs/README.md`                                                | Track Spec 012.                                                                                |
| `docs/ai/STATE.md`                                                    | Record factual implementation and verification results.                                        |

There are no server API, provider, database, migration, or generated Flow changes.

### Publication readiness

The implementation will keep standalone components directly exportable and avoid
side-effectful module initialization. The README will record the current blockers:
workspace libraries use TypeScript source aliases, have no package manifests or
Angular package build targets, and therefore do not yet emit independently
publishable exports/types or declare Angular/Quartz peer dependencies. Converting
all consumer SDK libraries to publishable packages is outside this spec.

## 5. Constraints

- Standalone Angular 21 components, signal APIs, `inject()`, modern control flow,
  and zoneless compatibility; no NgModule or RxJS component state.
- No browser globals during construction or SSR rendering. DOM focus work runs
  only from browser-originated overlay events and is guarded where needed.
- UI calls only `DevAuth.login()`/`logout()` and reads its signals; it must never
  implement OAuth, PKCE, token storage/exchange, or client-secret handling.
- Use installed `quartz-headless@0.2.0`; add no headless UI dependency. Do not bind
  the reusable library to Volt, Tailwind, Angular Movement, or DevFlare styling.
- Preserve exact existing DevFlare auth routes and return-to behavior.
- Do not modify `apps/dev-auth` provider UI or generated `.flow.js` files.
- Keep scope to SignIn and UserButton; avoid speculative configuration APIs.

## 6. Test plan

- Unit-test SignIn anonymous/loading/authenticated states, custom labels,
  `returnTo`, single activation while redirecting, synchronous failure, and native
  button keyboard semantics using a stubbed `DevAuth`.
- Unit-test UserButton loading/anonymous/authenticated states, image and initials/
  generic fallbacks, long/missing identity, open/outside/Escape close, initial and
  arrow-key focus, focus restoration, projected actions, successful logout,
  duplicate-submit prevention, and logout failure.
- Render each component with a server platform injector (or the closest supported
  Angular server-render test harness) and assert no browser-global access/crash.
- Extend Playwright assertions for DevFlare `/login`, absence of credential fields,
  authorization hand-off, authenticated UserButton/menu, and logout. Run the full
  local DevFlare -> DevAuth hosted login -> callback -> UserButton -> logout flow.
- Run `pnpm check` (format, lint, typecheck, tests, and production build) plus the
  relevant Playwright suite. Record exact results in section 8.

## 7. Tasks

- [x] 1. Create and configure `@org/auth-ui`; document the boundary and public API.
- [x] 2. Implement and unit-test `DevAuthSignIn`.
- [x] 3. Implement and unit-test `DevAuthUserButton` and its projected action slot.
- [x] 4. Dogfood both components in DevFlare and update consumer E2E coverage.
- [x] 5. Verify SSR, run `pnpm check`, and exercise the real browser auth flow.
- [x] 6. Record verification, publication gaps, and deviations in this spec.
- [x] 7. Update `docs/ai/STATE.md` and the spec index.

## 8. Verification results

- `pnpm check`: passed (Prettier, lint for 9 projects, typecheck for 7
  projects, all Vitest projects, and the Analog client/SSR/server build).
- `nx test auth-ui`: 17 tests passed across SignIn and UserButton.
- `nx e2e devflare-e2e --grep "Auth Pages"`: 18 tests passed across Chromium,
  Firefox, and WebKit.
- Real local browser flow passed with `test@devflare.com`: DevFlare SignIn ->
  hosted DevAuth credentials -> callback -> authenticated UserButton -> menu
  with initial `menuitem` focus -> logout -> `/api/auth/session` returned
  `{ "user": null }`.
- Desktop 1440x900 and mobile 390x844 screenshots were inspected. The mobile
  menu bounds were x=86, y=57.5, width=288, height=174.4375; no overlap or
  viewport overflow was observed when opened at that viewport.
- Production build emitted both client and SSR bundles and completed Analog's
  server build, with no SSR crash.

## 9. Log / Deviations

- 2026-09-04: Drafted from the Visual Consumer SDK v1 brief after confirming
  `main` is clean at `5bfebef` and includes PR #31.
- 2026-09-04: Owner approved implementation. Work started on
  `feature/012-dev-auth-angular-ui`. Added `errorMessage` to the SignIn contract
  so consumer callback failures retain alert semantics, and require the SSR
  render to use the same initial loading branch as browser hydration.
- 2026-09-04: Implementation completed and dogfooded. No provider/server/schema
  changes and no new dependencies. The changes remain local and uncommitted;
  no PR or deployment exists yet.
