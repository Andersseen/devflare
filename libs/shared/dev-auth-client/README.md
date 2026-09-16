# @dev-auth/client

Framework-independent browser session client for DevAuth consumers.

It talks only to the consuming application's same-origin session API
(`/api/auth/session`, `/login`, `/logout`, `/user` by default). It does not
perform OAuth/OIDC token exchange and has no UI dependency.

Install it directly for headless browser state, or let `@dev-auth/angular` and
`@dev-auth/elements` share one `AuthController` instance.
