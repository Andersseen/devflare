# 016 — DevAuth SDK hardening

| Field   | Value                        |
| ------- | ---------------------------- |
| Status  | In progress                  |
| Branch  | `feature/dev-auth-hardening` |
| Created | 2026-09-16                   |
| Updated | 2026-09-16                   |

## 1. Summary

Hardens the existing DevAuth SDK ecosystem without adding new product
capability: the browser/session controller moves out of the visual Elements
package into a new headless `@dev-auth/client` package, controller state gains
explicit error semantics and real `Date` normalization, package artifacts are
smoked outside the monorepo path-alias graph, and the visual elements get
targeted accessibility/responsiveness fixes.

## 2. Problem / Motivation

`@dev-auth/angular` depended on `@dev-auth/elements` only because
`AuthController` lived there. That made a headless Angular consumer install the
visual Elements package and its `@andersseen/*` UI dependencies. The controller
also collapsed `/session` failures into anonymous state and typed JSON date
strings as `Date` instances.

The reusable UI also still had concrete polish/accessibility issues: the
account menu stayed in the host page's navbar stacking context and could render
behind/through app content, the `and-menu-list` API had drifted from
`aria-menu-label` to `menu-label`, and the sign-in card used a hard fixed width.

## 3. Goals & Non-goals

- **Goals**: introduce a headless browser/session package; make Angular depend
  on the headless package, not Elements; keep Elements optional and visual-only;
  preserve compatibility re-exports from Elements for now; harden session
  errors, return paths, date normalization, stale request handling, and package
  manifests; improve the current SignIn/UserButton defaults without adding new
  auth features.
- **Non-goals**: Cloudflare Connect implementation; new sign-in methods;
  Clerk-like profile/org/MFA components; rewriting `@dev-auth/core`.

## 4. Design

Package graph:

```text
@dev-auth/core      server-side OAuth/OIDC protocol client
@dev-auth/client    browser/session controller, no UI/framework
@dev-auth/angular   Angular signals/DI adapter over @dev-auth/client
@dev-auth/elements  Custom Elements over @dev-auth/client + visual deps
```

`@dev-auth/client` owns `AuthController`, `AuthControllerState`, `AuthUser`,
`safeReturnTo`, and `signInUrl`. `AuthStatus` is now
`loading | anonymous | authenticated | error`, and `AuthControllerState` carries
`error: AuthControllerError | null` so a network/backend failure is not silently
treated as logout. Wire users normalize `createdAt`/`updatedAt` into real
`Date` instances before reaching consumers.

Elements keeps compatibility re-exports of the controller API, but new headless
consumers should import from `@dev-auth/client`.

The UserButton menu is portaled to `document.body` while open, copies the
computed DevAuth design tokens onto that portaled panel, uses the Popover API
top layer when available, and has a fixed-position collision-aware fallback.
The panel now owns an explicit opaque surface, border, shadow, and compact
width, so it no longer depends on a navbar/sidebar ancestor for paint or
stacking. It uses `menu-label` on `and-menu-list`, closes on
Escape/outside/item click, and repositions on scroll/resize.
`dev-auth-state-change` no longer broadcasts the user object in `detail`.

Package builds explicitly serialize `dev-auth-client` before Angular/Elements.
The JS packages declare runtime dependencies found by tarball smoke tests:
`tslib`, and for Elements also `@flowview/runtime`.

## 5. Constraints

No generated `.flow.js` edits by hand; templates were edited and regenerated
with `dev-auth-elements:build:flow`. No new visual components or auth methods.
No Angular dependency in `@dev-auth/elements`; no Elements dependency in
`@dev-auth/angular`.

## 6. Test plan

- Unit: `dev-auth-client`, `dev-auth-elements`, `dev-auth-angular`.
- Build: publishable SDK packages.
- Package smoke: `npm pack` tarballs and plain Node import checks outside the
  monorepo path-alias graph.
- Repo gates: format, lint, typecheck, tests, and build where Nx graph startup
  allows.

## 7. Tasks

- [x] 1. Add `@dev-auth/client`.
- [x] 2. Move/harden `AuthController` semantics.
- [x] 3. Rewire Angular and Elements to `@dev-auth/client`.
- [x] 4. Fix Elements overlay, `and-menu-list` API drift, responsive SignIn
     sizing, scoped theme handling, and event detail.
- [x] 5. Harden package manifests and tarball contents.
- [ ] 6. Run full repo quality gates.
- [ ] 7. Update STATE and open PR.

## 8. Verification results

Partial verification so far:

- `nx run-many -t test -p dev-auth-client,dev-auth-elements --skip-nx-cache`
  passed.
- `nx run dev-auth-angular:vite:test --skip-nx-cache` passed.
- `nx run-many -t build -p dev-auth-core,dev-auth-client,dev-auth-elements,dev-auth-angular --skip-nx-cache`
  passed before the later ESM import/package manifest smoke fixes.
- `npm pack` tarball inspection caught and fixed accidental Elements
  `test-utils` publication.
- Plain Node import smoke passed for packed `@dev-auth/client`.
- Plain Node import smoke passed for packed `@dev-auth/elements` with local
  dependencies linked.

Known local verification wrinkle: after several Nx resets, Nx graph startup
intermittently hung at "Calculating the project graph" / "Failed to start plugin
worker". Continue verification with daemon disabled or after another reset.

## 9. Log / Deviations

2026-09-16: The package smoke tests found two concrete packaging issues not
visible through TS path aliases: published ESM needed `.js` relative imports,
and JS packages needed explicit `tslib`/`@flowview/runtime` runtime
dependencies. Fixed in scope.
