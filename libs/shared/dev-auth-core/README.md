# @dev-auth/core

Framework-agnostic OAuth 2.1 / OIDC consumer SDK for **dev-auth**, this repo's
standalone identity provider. Path-aliased as `@dev-auth/core` — the `@dev-auth`
npm scope is reserved for this SDK's eventual publication, though this
package itself isn't published yet (see [Naming](#naming) below).

## Architecture

```text
                    dev-auth
                       │
                   OAuth/OIDC
                       │
                       ▼
               @dev-auth/core        ← this package (framework-agnostic)
                       │
              ┌────────┴────────┐
              ▼                 ▼
       apps/devflare      future server consumers (Hono, other Analog apps)
       (server routes)
              │
              ▼
         @dev-auth/angular               ← Angular adapter (app-session facade)
```

`@dev-auth/core` owns the OAuth/OIDC protocol: discovery, PKCE, state and
nonce, the authorization code exchange, userinfo, and normalized errors. It
never touches cookies, an HTTP framework, or a consumer app's own session —
see [Session boundary](#session-boundary).

`@dev-auth/angular` is a separate, smaller package: a signals-based Angular facade
over a _consumer application's own_ session endpoints (`/api/auth/session`,
`/login`, `/logout`, `/user`). It does not speak OAuth/OIDC at all — by the
time Angular code can inject it, the server-side flow above has already run.

## Installation

Internal workspace package, resolved through the `@dev-auth/*` TS path
aliases (see `tsconfig.base.json`) — nothing to install. A consumer app using
Nitro/Vite needs an explicit alias if it imports this package from a server
route (see `apps/devflare/vite.config.ts`'s `nitro.alias`): Nitro's server
bundle does not inherit the client build's `nxViteTsPaths()` resolution.

## Configuration

```ts
import { createDevAuthClient } from '@dev-auth/core';

const client = createDevAuthClient({
  issuer: 'https://auth.example.com',
  clientId: 'my-app',
  clientSecret: 'only for confidential clients',
  redirectUri: 'https://my-app.example.com/api/auth/callback',
  // scope defaults to 'openid profile email'
});
```

Reading `issuer`/`clientId`/`clientSecret`/`redirectUri` from environment
variables, Cloudflare bindings, or anywhere else is the consumer's job — see
`apps/devflare/src/server/lib/oidc.ts`'s `resolveOidcConfig` for the pattern
this app uses. That function is deliberately outside this package: it is
Cloudflare/DevFlare-specific, not protocol code.

## Server flow

```ts
// GET /api/auth/login
const { url, transaction } = await client.createAuthorizationRequest({
  returnTo: query.returnTo,
});
setCookie('oauth_tx', JSON.stringify(transaction), { httpOnly: true, maxAge: 600 });
redirect(url);

// GET /api/auth/callback
const transaction = JSON.parse(getCookie('oauth_tx'));
try {
  const { identity, tokens } = await client.handleCallback({ code: query.code, state: query.state, error: query.error }, transaction);
  // identity: { subject, email?, name?, picture? }
  await myApp.startSession(identity); // application-owned, see below
} catch (error) {
  if (error instanceof AuthorizationDeniedError /* error.code from the provider */);
  if (error instanceof InvalidStateError /* expired/forged callback */);
  if (error instanceof ProtocolError /* exchange or userinfo failed */);
}
```

See `apps/devflare/src/server/routes/api/auth/{login,callback}.ts` for the
full, real integration this is drawn from.

## Angular consumption

`@dev-auth/core` has no Angular dependency and is not used from browser
code — Angular consumes `@dev-auth/angular` instead, which talks to the _application's_
own session API:

```ts
// app.config.ts
providers: [provideDevAuth()] // optional; defaults to basePath: '/api/auth'

// anywhere
const auth = inject(DevAuth);
auth.user();            // Signal<AuthUser | null>
auth.isAuthenticated();  // Signal<boolean>
auth.isLoading();        // Signal<boolean>
auth.login(returnTo?);   // full-page navigation to this app's own /login route
auth.logout();
```

```html
@if (auth.user(); as user) { {{ user.name }} }
```

Two route guards exist (`authGuard`, `guestGuard`) for redirecting the SPA
based on `auth.isAuthenticated()`. **These are UX only, not a security
boundary** — they run in the browser and only decide what the SPA renders.
Every server route a consumer app protects must independently call something
equivalent to DevFlare's `requireAuth(getAppSession(event))`.

## Security responsibilities

This SDK:

- Always uses PKCE with `S256` (never `plain`).
- Generates a fresh `state` and `nonce` per authorization request and
  validates `state` on callback, rejecting a missing, mismatched, or replayed
  one before any network call.
- Validates the discovery document's `issuer` against the configured one and
  throws rather than silently trusting a mismatched provider.
- Never puts a client secret in a URL, a log line, or an error message.
- Logs the provider's raw response on a token-exchange or userinfo failure
  (for the operator) but never returns that text to the caller — thrown
  errors carry only a generic, safe-to-display message.
- Validates a `returnTo` is same-site (`safeReturnTo`) before it round-trips
  through the transaction, so a forged `returnTo` cannot become an open
  redirect even if a caller forgets to check it again.

This SDK does **not**:

- Store or manage a consumer application's own session — see
  [Session boundary](#session-boundary).
- Verify or decode ID tokens. Identity comes from one authenticated call to
  the userinfo endpoint instead — no signature to verify, no key to keep in
  sync. (Verifying `id_token` is a reasonable future addition if a consumer
  needs it without an extra round trip; `handleCallback` already returns the
  raw token response.)
- Enforce authorization/route protection. A guard built on top of this (see
  `@dev-auth/angular`'s `authGuard`) is UX, not a security boundary.
- Know anything about a specific consumer application, Cloudflare, or any
  other runtime beyond `fetch` and Web Crypto.

## Session boundary

DevAuth SDK does not dictate how an application stores its own session.
DevFlare's choice — opaque random token → SHA-256 → D1 row, cookie holds only
the token — is application infrastructure, not protocol, and lives in
`apps/devflare/src/server/lib/session.ts`, entirely outside this package.
`handleCallback` returns a normalized identity:

```ts
interface NormalizedIdentity {
  subject: string;
  email?: string;
  name?: string;
  picture?: string;
}
```

and the consumer decides what to do with it.

## Discovery

`client.discover()` fetches `{issuer}/.well-known/openid-configuration`,
cached in-memory per issuer (10 minutes by default). An issuer mismatch always
throws (a spoofing signal). An unreachable or non-200 discovery endpoint falls
back to dev-auth's conventional endpoint layout (`{issuer}/api/auth/oauth2/*`)
rather than failing every authorization attempt — cached briefly (30s) so a
real outage does not turn into a fetch-per-request storm, and so the next call
retries discovery instead of assuming the outage continues forever.

## What this package does NOT do

- Build UI. No `SignIn`/`SignUp`/`UserButton` components — see the Angular
  section above; a consumer wires its own login page.
- Manage refresh tokens, token storage, or silent renewal — a caller decides
  what to do with the token response `handleCallback` returns.
- Support any framework adapter beyond the one server-side pattern documented
  here and the Angular consumer-session facade in `@dev-auth/angular`. React/Vue/Astro
  adapters, an Analog-specific server package, and npm publication are
  explicitly out of scope for this phase.

## Naming

This package is internal to the `devflare` Nx workspace and published nowhere
yet. The `@dev-auth` npm scope is reserved for this SDK's eventual
publication (`@dev-auth/core`, `@dev-auth/angular`, `@dev-auth/elements`), and
the TS path aliases already use it — but actually publishing still needs: a
real `package.json` per package with `name`/`exports`/`types` (no library in
this monorepo has one today — they are all consumed through TS path aliases
only) and a semver/release process. None of that is done here by design —
see the task's explicit non-goals.
