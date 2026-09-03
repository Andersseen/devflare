# @org/auth

Angular adapter for a DevAuth consumer application's _own_ session — not an
OAuth/OIDC client. See [@org/dev-auth-core](../dev-auth-core/README.md) for
the protocol layer this pairs with, and its "Architecture" and "Angular
consumption" sections for how the two fit together.

Public API: `provideDevAuth()`, the `DevAuth` injectable (`user()`,
`isAuthenticated()`, `isLoading()`, `login()`, `logout()`, `updateName()`,
`ready()`), and the `authGuard`/`guestGuard` route guards (UX only — see the
guard file's doc comment).

## Running unit tests

Run `nx test auth` to execute the unit tests.
