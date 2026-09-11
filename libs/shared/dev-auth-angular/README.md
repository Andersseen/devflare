# @dev-auth/angular

Angular adapter for a DevAuth consumer application's _own_ session — not an
OAuth/OIDC client. See [@dev-auth/core](../dev-auth-core/README.md) for
the protocol layer this pairs with, and
[@dev-auth/elements](../dev-auth-elements/README.md) for the framework-agnostic
`AuthController` this package wraps in signals rather than fetching the
session itself.

Public API: `provideDevAuth({ basePath?, controller? })`, the `DevAuth`
injectable (`user()`, `isAuthenticated()`, `isLoading()`, `login()`,
`logout()`, `updateName()`, `ready()`), and the `authGuard`/`guestGuard` route
guards (UX only — see the guard file's doc comment).

Pass `controller` to `provideDevAuth()` to reuse an `AuthController` built
elsewhere (e.g. one already shared with `<dev-auth-sign-in>`/
`<dev-auth-user-button>` via `provideDevAuthElements()`) instead of having
`DevAuth` construct its own — see `@dev-auth/elements`'s README for the
shared-controller pattern.

## Running unit tests

Run `nx run dev-auth-angular:test` to execute the unit tests.
