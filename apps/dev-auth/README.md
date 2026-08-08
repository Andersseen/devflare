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

## Features

- 🔐 **Email & password + GitHub** — one account, either method, with account
  linking between them
- 🪪 **OAuth 2.1 / OIDC provider** — authorization code flow with mandatory PKCE,
  ES256-signed ID tokens, and a JWKS endpoint
- 🗄️ **Cloudflare D1** — serverless SQLite for users, sessions and issued tokens
- 🎨 **Web Components UI** — auth pages built with `@andersseen/web-components`
- 🔒 **Rate limiting** — brute-force protection on the credential endpoints
- 🚀 **Framework agnostic** — any OIDC client library can consume it

## Tech Stack

| Layer     | Technology                                    |
| --------- | --------------------------------------------- |
| Framework | Hono                                          |
| Auth      | Better Auth (`oidc-provider` + `jwt` plugins) |
| Database  | Cloudflare D1 (SQLite) via Drizzle            |
| UI        | `@andersseen/web-components`, Flowview        |
| Deploy    | Cloudflare Workers                            |

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

`apps/dev-auth/.dev.vars` (gitignored — see the note under
[Security](#security-notes)):

```
BETTER_AUTH_SECRET=a-long-random-string
# One JSON object mapping client id -> client secret, for the clients declared
# in wrangler.toml. Generate values with: openssl rand -hex 32
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
- `type: "public"` — no secret; authenticated by PKCE alone. For clients that
  cannot keep one.
- `redirectURIs` are matched **exactly**. No prefixes, no wildcards, no implicit
  trailing slash. List every callback the app actually uses.

A malformed entry is dropped with an error in the logs rather than taking the
whole service down, so email/password and GitHub sign-in keep working — but that
client will get `invalid_client` until the config is fixed. Check the Worker logs
(`pnpm cf:tail:auth`) after changing this.

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

Discovery lives at both the issuer root and under the auth base path:

```
https://auth-devflare.andersseen.dev/.well-known/openid-configuration
```

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

| Endpoint                            | Method | Description                             |
| ----------------------------------- | ------ | --------------------------------------- |
| `/health`                           | GET    | Service health check                    |
| `/.well-known/openid-configuration` | GET    | OIDC discovery document                 |
| `/api/auth/oauth2/authorize`        | GET    | Start an authorization flow             |
| `/api/auth/oauth2/token`            | POST   | Exchange a code (or refresh) for tokens |
| `/api/auth/oauth2/userinfo`         | GET    | Identity for an access token            |
| `/api/auth/jwks`                    | GET    | ID token verification keys              |
| `/api/auth/sign-up/email`           | POST   | Register a new user                     |
| `/api/auth/sign-in/email`           | POST   | Sign in                                 |
| `/api/auth/sign-in/social`          | POST   | Start GitHub sign-in                    |
| `/api/auth/sign-out`                | POST   | End the provider session                |
| `/api/auth/get-session`             | GET    | The provider's own session              |
| `/api/setup/d1`                     | POST   | Create D1 database (setup wizard)       |

`/login`, `/signup`, `/forgot`, `/verify` and `/setup` serve the HTML pages.

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

## Project Structure

```
apps/dev-auth/
├── src/
│   ├── index.ts              # Hono app entry point, routing, discovery
│   ├── auth.config.ts        # Better Auth + OIDC provider configuration
│   ├── oauth-clients.ts      # Registered consumer applications
│   ├── db/
│   │   ├── schema.ts         # Drizzle schema (core + provider tables)
│   │   ├── index.ts          # Database connection
│   │   └── migrations/       # D1 migrations
│   ├── routes/               # better-auth mount, setup, admin, analytics
│   ├── pages/                # Flowview auth pages
│   ├── middleware/           # CORS, session, rate limiting, headers
│   └── lib/                  # Validation helpers
├── wrangler.toml             # Cloudflare Worker config + client registry
├── .dev.vars                 # Local secrets (see Security notes)
└── README.md
```

## Security Notes

- **`BETTER_AUTH_SECRET`** must be a strong random string. It also encrypts the
  ID token signing keys in the `jwks` table, so rotating it without clearing that
  table breaks token signing.
- **`apps/dev-auth/.dev.vars` is tracked in git** (committed before it was
  ignored). `.gitignore` does not apply to tracked files: run
  `git rm --cached apps/dev-auth/.dev.vars` and rotate the `BETTER_AUTH_SECRET`
  it contains.
- **Redirect URIs** are compared with string equality against the registry. No
  prefix or substring matching anywhere in the flow.
- **PKCE is mandatory** (`S256` only) for every client, confidential ones
  included.
- **Client secrets** are stored as configuration, not in the database, and never
  appear in a URL or in an error returned to a browser.
- **Rate limiting**: 10 req/min per IP on credential endpoints; 60 req/min on the
  OAuth endpoints, which receive one call per user login from a consumer's server
  rather than one per user.
- **CORS**: configurable via `DEV_AUTH_CORS_ORIGINS`. The OAuth back channel does
  not need it — those calls are server to server.

### Known limitation

The `oidc-provider` plugin this builds on is deprecated in better-auth 1.6 and
will be removed in 2.0, in favour of `@better-auth/oauth-provider`. It was chosen
anyway: it ships with the pinned better-auth, supports config-declared clients
directly, and needs no consent UI for first-party apps. Migrating means a
better-auth major upgrade and a schema change (`oauthApplication` →
`oauthClient`), so it is a deliberate later step, not a blocker.

## Testing

```bash
pnpm nx test dev-auth        # provider flow + client registry
pnpm nx typecheck dev-auth
```

`src/__tests__/oidc-provider.spec.ts` drives the real better-auth instance
through the whole flow — authorize, login, code, token exchange, userinfo —
using the same `createAuthOptions` the Worker uses, against an in-memory
database. It covers registered vs unregistered redirect URIs, PKCE enforcement,
client isolation and two applications coexisting.

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
