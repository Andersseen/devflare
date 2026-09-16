# @dev-auth/angular

Angular adapter for a DevAuth consumer application's _own_ session — not an
OAuth/OIDC client. See [@dev-auth/core](../dev-auth-core/README.md) for
the protocol layer this pairs with, and
[@dev-auth/client](../dev-auth-client/README.md) for the framework-agnostic
`AuthController` this package wraps in signals rather than fetching the
session itself.

Public API: `provideDevAuth({ basePath?, controller? })`, the `DevAuth`
injectable (`user()`, `status()`, `error()`, `isAuthenticated()`,
`isLoading()`, `login()`, `logout()`, `updateName()`, `ready()`), and the
`authGuard`/`guestGuard` route guards (UX only — see the guard file's doc
comment).

Pass `controller` to `provideDevAuth()` to reuse an `AuthController` built
elsewhere (e.g. one already shared with `<dev-auth-sign-in>`/
`<dev-auth-user-button>` via `provideDevAuthElements()`) instead of having
`DevAuth` construct its own.

## Install

**Outside this monorepo:** `pnpm add @dev-auth/angular` (or npm/yarn). This
installs `@dev-auth/client`, but not `@dev-auth/elements` or any visual
dependencies. Install `@dev-auth/elements` separately only when you want the
Custom Elements UI. Requires these peer dependencies from your own app:

- `@angular/core` `^21.0.0`
- `@angular/common` `^21.0.0`
- `@angular/router` `^21.0.0`

**Inside this monorepo:** consumed straight from TypeScript source via the
`@dev-auth/angular` path alias (`tsconfig.base.json`) — nothing to install.

## Running unit tests

Run `nx run dev-auth-angular:test` to execute the unit tests.
