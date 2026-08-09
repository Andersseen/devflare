# DevFlare Auth (`dev-auth`)

A personal **authentication provider**: users sign in here once, and any of my
applications can authenticate against it through a standard OAuth 2.1 /
OpenID Connect flow.

`dev-auth` lives inside the DevFlare monorepo, but it is **not** part of DevFlare.
It is deployed on its own as a Cloudflare Worker with its own D1 database and its
own domain, and consumers reach it over HTTP like any other identity provider.
DevFlare is simply the first registered client; an application in a completely
different repository, on an unrelated domain, integrates the same way and needs
nothing from this repo.

```text
                        dev-auth
                   Cloudflare Worker
                  Identity provider
                  email/password + GitHub
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
          DevFlare      Imaginaryx     Other app
      (this monorepo)  (other repo)   (other repo)
```

Each consumer completes the flow and then keeps **its own** session. Nothing
depends on sharing this service's cookie, which is what lets a consumer live on a
different domain.

`dev-auth` has no application of its own. Opening it directly and signing in
gives you a session _with the provider_ and nothing more — there is no dashboard,
and it does not stand in for any particular app. GitHub is an upstream detail of
this service alone: a consumer sees `dev-auth` as its identity provider and never
talks to GitHub.

## Features

- 🔐 **Email & password + GitHub** — one account, either method, with account
  linking between them
- 🪪 **OAuth 2.1 / OIDC provider** — authorization code flow with mandatory PKCE,
  ES256-signed tokens, a JWKS endpoint, token revocation and introspection
- 📄 **Standards discovery** — OpenID configuration and OAuth authorization-server
  metadata at the issuer root, so any client library configures itself
- 🗄️ **Cloudflare D1** — serverless SQLite for users, sessions and issued tokens
- 🎨 **Web Components UI** — auth pages built with `@andersseen/web-components`
- 🔒 **Rate limiting** — brute-force protection on the credential endpoints
- 🚀 **Framework agnostic** — any OIDC client library can consume it

## Tech Stack

| Layer     | Technology                                              |
| --------- | ------------------------------------------------------- |
| Framework | Hono                                                    |
| Auth      | Better Auth 1.6 (`@better-auth/oauth-provider` + `jwt`) |
| Database  | Cloudflare D1 (SQLite) via Drizzle                      |
| UI        | `@andersseen/web-components`, Flowview                  |
| Deploy    | Cloudflare Workers                                      |

## Quick Start

### Prerequisites

- Node.js 22+, pnpm 9+
- Cloudflare account (free tier works), Wrangler CLI

### Local development

```bash
pnpm install

# Apply migrations to the local (miniflare) D1
pnpm cf:auth d1 migrations apply DB --local

# Start the service
pnpm dev:auth          # or: nx serve dev-auth
```

The service runs at `http://localhost:8787`. `pnpm dev:all` starts it alongside
the DevFlare app on `:4200`.

### Local secrets

`apps/dev-auth/.dev.vars` — gitignored and untracked; keep it that way, and see
[Secret rotation still owed](#secret-rotation-still-owed) for the value that was
committed before it was:

```
BETTER_AUTH_SECRET=a-long-random-string
# One JSON object mapping client id -> client secret, for the confidential
# clients declared in wrangler.toml. 32+ characters; shorter ones still work but
# are logged as a warning at boot. Generate with: openssl rand -base64 32
OAUTH_CLIENT_SECRETS={"devflare-dev":"a-long-random-string"}
```

The same client secret has to be given to the consumer, so for local DevFlare put
it in `apps/devflare/.dev.vars` as `DEV_AUTH_CLIENT_SECRET`.

For deployed environments:

```bash
wrangler secret put BETTER_AUTH_SECRET
wrangler secret put OAUTH_CLIENT_SECRETS
wrangler secret put GITHUB_CLIENT_SECRET
```

### Flowview templates

Auth pages live in `src/pages/*.flow` and are precompiled to `.flow.js` by the
`[build] command` in `wrangler.toml`.

```bash
pnpm --filter @devflare/dev-auth build:flow   # one-shot
pnpm --filter @devflare/dev-auth watch:flow   # watch mode, alongside wrangler dev
```

> Compilation runs through `@flowview/compiler` (the WASM compiler on npm), so
> `pnpm install` is the only prerequisite — no Rust toolchain. Generated
> `.flow.js` files are committed, because the page wrappers import them.

## Registering an application

Registration is **configuration**. There is no registration endpoint, no
self-service sign-up and no management dashboard — this provider serves my own
applications, and dynamic client registration is switched off.

Two values, split by whether they are secret:

| Value                  | Where                                 | Contains                               |
| ---------------------- | ------------------------------------- | -------------------------------------- |
| `OAUTH_CLIENTS`        | `wrangler.toml` `[vars]` (in git)     | client id, name, type, redirect URIs   |
| `OAUTH_CLIENT_SECRETS` | Worker secret / `.dev.vars` (not git) | `{ "<client id>": "<client secret>" }` |

Keeping the definitions in version control is deliberate: the redirect URIs
decide where an authorization code may be delivered, so changing one should show
up in a diff.

```toml
OAUTH_CLIENTS = '''[
  {
    "clientId": "devflare",
    "name": "DevFlare",
    "type": "web",
    "redirectURIs": ["https://devflare.andersseen.dev/api/auth/callback"]
  },
  {
    "clientId": "imaginaryx",
    "name": "Imaginaryx",
    "type": "web",
    "redirectURIs": ["https://imaginaryx.example.com/auth/callback"]
  }
]'''
```

- `type: "web"` — confidential: needs an `OAUTH_CLIENT_SECRETS` entry. Use this
  for anything with a server (the code exchange happens server side).
- `type: "native"` / `type: "user-agent-based"` — public: no secret, authenticated
  by PKCE alone. Configuring a secret for one of these is rejected, because the
  secret would not be protecting anything.
- `redirectURIs` are matched **exactly**. No prefixes, no wildcards, no implicit
  trailing slash. List every callback the app actually uses.
- `enableEndSession: true` plus `postLogoutRedirectURIs` opts a client into
  RP-initiated logout (`/api/auth/oauth2/end-session`). Off by default: it lets
  one client end the session every _other_ client is relying on.

Client secrets never reach the database in any form. The registry hashes
each one at boot and the provider is given that hash to compare against, so
`oauthClient` in D1 stays empty and deleting a client from `OAUTH_CLIENTS`
removes it from the provider outright — there is no stale row that could still
complete an authorization.

Validation is per-entry. A malformed client is dropped with an error in the logs
rather than taking the whole service down, so email/password, GitHub, and every
_other_ consumer keep working — but that one client gets `invalid_client` until
the config is fixed. Failures that would make security ambiguous fail closed
instead: unreadable `OAUTH_CLIENTS` registers nobody, and unreadable
`OAUTH_CLIENT_SECRETS` registers no confidential client rather than quietly
letting one through without a secret. Weak-but-working configuration (a client
secret under 32 characters) is logged as a warning and left running. Check the
Worker logs (`pnpm cf:tail:auth`) after changing this.

## How a consumer integrates

```text
1. Register the application in OAUTH_CLIENTS (+ its secret).
2. Configure its redirect URI on both sides — they must match exactly.
3. Redirect the user to the authorization endpoint (PKCE + state).
4. The user authenticates in dev-auth (password or GitHub).
5. dev-auth redirects back to the redirect URI with ?code=&state=.
6. The app exchanges the code for tokens at the token endpoint, server side.
7. The app creates its OWN session and forgets the tokens.
```

Step 7 is the part that matters architecturally: the consumer does not keep
asking dev-auth "who is this?" on every request, and does not share its cookie.

Both discovery documents live at the issuer root, which is where a generic
client library looks for them:

```
https://auth-devflare.andersseen.dev/.well-known/openid-configuration
https://auth-devflare.andersseen.dev/.well-known/oauth-authorization-server
```

Point an OIDC client library at the issuer (`https://auth-devflare.andersseen.dev`)
and everything else — endpoints, supported algorithms, JWKS location — comes from
there. A consumer needs no code from this repository, no better-auth dependency,
no access to this service's D1 and no cookie from it.

```bash
# 3 — send the browser here
GET /api/auth/oauth2/authorize
  ?response_type=code
  &client_id=imaginaryx
  &redirect_uri=https%3A%2F%2Fimaginaryx.example.com%2Fauth%2Fcallback
  &scope=openid%20profile%20email
  &state=<random>&nonce=<random>
  &code_challenge=<S256 of verifier>&code_challenge_method=S256

# 6 — back channel, from the app's server
POST /api/auth/oauth2/token       (application/x-www-form-urlencoded)
  grant_type=authorization_code&code=…&redirect_uri=…
  &client_id=imaginaryx&client_secret=…&code_verifier=…

# identity
GET /api/auth/oauth2/userinfo     Authorization: Bearer <access_token>
```

`apps/devflare/src/server/lib/oidc.ts` plus the four handlers in
`apps/devflare/src/server/routes/api/auth/` are a complete worked example of a
consumer, in about 200 lines and with no auth SDK.

## API Endpoints

| Endpoint                                  | Method | Description                             |
| ----------------------------------------- | ------ | --------------------------------------- |
| `/health`                                 | GET    | Service health check                    |
| `/.well-known/openid-configuration`       | GET    | OIDC discovery document                 |
| `/.well-known/oauth-authorization-server` | GET    | OAuth authorization-server metadata     |
| `/api/auth/oauth2/authorize`              | GET    | Start an authorization flow             |
| `/api/auth/oauth2/token`                  | POST   | Exchange a code (or refresh) for tokens |
| `/api/auth/oauth2/userinfo`               | GET    | Identity for an access token            |
| `/api/auth/oauth2/introspect`             | POST   | Token state, for a registered client    |
| `/api/auth/oauth2/revoke`                 | POST   | Revoke an access or refresh token       |
| `/api/auth/oauth2/end-session`            | GET    | RP-initiated logout (opt-in per client) |
| `/api/auth/oauth2/consent`                | POST   | Record a consent decision               |
| `/api/auth/jwks`                          | GET    | Token verification keys                 |
| `/api/auth/sign-up/email`                 | POST   | Register a new user                     |
| `/api/auth/sign-in/email`                 | POST   | Sign in                                 |
| `/api/auth/sign-in/social`                | POST   | Start GitHub sign-in                    |
| `/api/auth/sign-out`                      | POST   | End the provider session                |
| `/api/auth/get-session`                   | GET    | The provider's own session              |
| `/api/setup/d1`                           | POST   | Create D1 database (setup wizard)       |

`/`, `/login`, `/signup`, `/forgot`, `/consent`, `/verify` and `/setup` serve the
HTML pages. `/` is the provider's own signed-in page (or a redirect to `/login`).

**Permanently 404, by design:** `/api/auth/oauth2/register`, `.../create-client`,
`.../update-client`, `.../delete-client` and `.../client/rotate-secret`. Clients
are registered in configuration; see [Security notes](#security-notes) for the
three independent locks that keep those closed.

## Deployment

```bash
# 1. Create the D1 database
wrangler d1 create dev-auth-db

# 2. Apply migrations
pnpm db:migrate:auth

# 3. Set secrets
wrangler secret put BETTER_AUTH_SECRET
wrangler secret put OAUTH_CLIENT_SECRETS

# 4. Deploy
pnpm deploy:auth
```

The `/setup` page also walks through creating the D1 database from a browser.

> **Migration order matters for `0003_oauth_provider_v2.sql`.** It renames the
> previous provider's tables aside and creates the new ones, so apply migrations
> _before_ deploying the Worker — a deployed Worker pointed at an unmigrated D1
> cannot serve an authorization request. Accounts, sessions, linked GitHub
> identities and signing keys are untouched by it; access and refresh tokens
> issued by the old plugin stop being redeemable, which costs each consumer one
> extra round through the authorization flow.

## Project Structure

```
apps/dev-auth/
├── src/
│   ├── index.ts              # Hono app entry point, routing, discovery
│   ├── auth.config.ts        # Better Auth + OAuth provider configuration
│   ├── oauth-clients.ts      # Registered consumer applications (parsing)
│   ├── client-registry.ts    # Serves those clients to the provider, read-only
│   ├── db/
│   │   ├── schema.ts         # Drizzle schema (core + provider tables)
│   │   ├── index.ts          # Database connection
│   │   └── migrations/       # D1 migrations
│   ├── routes/               # better-auth mount, setup, admin, analytics
│   ├── pages/                # Flowview auth pages
│   ├── middleware/           # CORS, session, rate limiting, headers
│   └── lib/                  # Client-secret hashing, validation helpers
├── wrangler.toml             # Cloudflare Worker config + client registry
├── .dev.vars                 # Local secrets (see Security notes)
└── README.md
```

## Security Notes

- **`BETTER_AUTH_SECRET`** must be a strong random string. It also encrypts the
  token signing keys in the `jwks` table, so rotating it without clearing that
  table breaks token signing.
- **Redirect URIs** are compared with string equality against the registry. No
  prefix or substring matching anywhere in the flow.
- **PKCE is mandatory** (`S256` only) for every client, confidential ones
  included. `plain` is refused outright rather than redirected with an error.
- **Client secrets** live in configuration, never in the database, and never
  appear in a URL, a log line or an error returned to a browser. They are hashed
  before the provider ever sees them and compared in constant time.
- **Client registration is closed**, held shut by three independent locks so that
  removing any one of them does not open it:
  1. the routes 404 in `src/index.ts`, before better-auth is reached;
  2. `clientPrivileges` denies every create/update/delete/rotate in
     `auth.config.ts`, including for a signed-in user;
  3. the client store in `client-registry.ts` refuses writes and has nowhere to
     put them — `oauthClient` in D1 is empty and stays empty.
- **Rate limiting**: 10 req/min per IP on credential endpoints; 60 req/min on the
  OAuth endpoints, which receive one call per user login from a consumer's server
  rather than one per user.
- **CORS**: configurable via `DEV_AUTH_CORS_ORIGINS`. The OAuth back channel does
  not need it — those calls are server to server.

### Secret rotation still owed

`apps/dev-auth/.dev.vars` was committed in the initial import and later removed
from tracking. It is gitignored and untracked today, and no secret file is
tracked now — but **git history still contains the `BETTER_AUTH_SECRET` that was
in it**. Removing a file from tracking does not remove it from history.

Whether the deployed secret was ever rotated cannot be established from this
repository. Treat that value as compromised until rotated by hand:

```bash
wrangler secret put BETTER_AUTH_SECRET --env production   # apps/dev-auth
```

Rotating it invalidates the encrypted private keys in the `jwks` table, so clear
that table in the same maintenance window and let the provider mint a fresh key
pair; consumers pick the new one up from `/api/auth/jwks` automatically. Live
provider sessions are also invalidated, so users sign in again once.

### Known limitation: no email delivery

There is no transactional email provider wired up, and none is being added yet.
`sendVerificationEmail` logs the link instead of sending it, so:

- `requireEmailVerification` is **off** — requiring a mail nobody can receive
  would create accounts that can never sign in;
- password recovery is **not** functional end to end, whatever `/forgot` implies;
- access is gated by `SIGNUP_ALLOWLIST` instead, which applies to GitHub sign-up
  as well as to email — the address GitHub returns has to be on the list.

This is a deliberate, temporary trade for a personal provider with one user. It
is not production-ready email verification and should not be described as such.
Wiring up a provider, then re-enabling `requireEmailVerification` and
`sendOnSignUp` together, is the step that closes it.

## Testing

```bash
pnpm nx test dev-auth        # provider flow + client registry
pnpm nx typecheck dev-auth
```

`src/__tests__/oauth-provider.spec.ts` drives the real better-auth instance
through the whole flow — authorize, login, code, token exchange, userinfo,
refresh, revoke — using the same `createAuthOptions` the Worker uses, against an
in-memory database. It covers registered vs unregistered redirect URIs, PKCE
enforcement, client authentication, single-use codes, client isolation, and two
independent applications (DevFlare and Imaginaryx) coexisting. Imaginaryx appears
here only as a second, deliberately unrelated client; nothing in its own
repository is involved.

`client-registry.spec.ts` covers the read-only client store on its own, and
`app.spec.ts` covers the routing layer: the blocked registration paths, both
discovery documents, and the fact that a direct visit never lands on a consumer
app.

### Manual smoke test

```bash
# Create the test user
pnpm seed:user          # test@devflare.com / TestPass123

# Discovery
curl http://localhost:8787/.well-known/openid-configuration

# Password sign-in
curl -X POST http://localhost:8787/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"test@devflare.com","password":"TestPass123"}' \
  -c cookies.txt

curl http://localhost:8787/api/auth/get-session -b cookies.txt
```

Then open `http://localhost:4200`, click **Sign In**, and confirm the browser
goes to `:8787`, authenticates, and comes back to `:4200` signed in.

## License

MIT
