# ARCHITECTURE — System map

> Verified against the code on 2026-08-08. If something here contradicts the code,
> the code wins — and update this file.

## Big picture

```
Browser ──► devflare (Analog/Nitro Worker, :4200 dev)
              │  /api/auth/login ─── 302 ──► dev-auth /oauth2/authorize
              │  /api/auth/callback ◄── 302 with ?code= ── dev-auth
              │        └─ back channel: POST /oauth2/token, GET /oauth2/userinfo
              │  /api/auth/session|logout|user ── devflare's OWN session (D1)
              │  /api/v1/*    ── h3 handlers ─────► Cloudflare D1 `devflare-db` (via db0)

dev-auth (Hono Worker, :8787) — OAuth 2.1 / OIDC identity provider
         ──► Cloudflare D1 (users/sessions/issued tokens/JWKS, Drizzle schema)
         ──► Cloudflare KV  (rate limiting)
```

**dev-auth is an identity provider, not DevFlare's auth backend.** DevFlare is one
registered OAuth client of it; applications in other repositories, on unrelated
domains, register the same way. See `apps/dev-auth/README.md`.

Two databases, on purpose: **auth data** lives in dev-auth's D1
(`dev-auth-db-prod`); **app data** (projects, deployments) plus DevFlare's own
`app_user`/`app_session` live in the app's own D1 (`devflare-db`). They only share
the user id — which is the `sub` claim dev-auth issues, so rows written before the
provider migration still resolve to the same person.

No shared cookie: DevFlare mints its own session after the flow, which is what
makes the arrangement work for a consumer on a different domain.

## Monorepo layout (Nx 22, pnpm)

| Path                | Alias         | What it is                                                            |
| ------------------- | ------------- | --------------------------------------------------------------------- |
| `apps/devflare`     | —             | Main AnalogJS app (Angular 21 + Vite 7 + Nitro SSR)                   |
| `apps/dev-auth`     | —             | Auth microservice (Hono + better-auth + D1, Cloudflare Workers)       |
| `apps/devflare-e2e` | —             | Playwright E2E tests                                                  |
| `libs/shared/core`  | `@org/core`   | Tool services (one per tool) + auth/projects/webcontainer services    |
| `libs/shared/ui`    | `@org/ui`     | Small shared components (badge, button, card, input)                  |
| `libs/shared/auth`  | `@org/auth`   | session client (this app's own endpoints), auth guard, service, types |
| `libs/deploy`       | `@org/deploy` | Deployment library (early stage)                                      |

## apps/devflare (main app)

- **Routing**: file-based. `src/app/pages/**/*.page.ts` → routes. `(home).page.ts`
  is `/`, `tools/qr-generator.page.ts` is `/tools/qr-generator`, etc. Pages are
  single-file standalone components with **default export**.
- **Layout**: `src/app/components/layout.component.ts` + `sidebar.component.ts`.
- **Server API** (Nitro/h3, file-based under `src/server/routes/`):
  - `api/auth/login.ts` — starts the authorization code flow (PKCE + state in a
    short-lived `df_oauth_tx` cookie), 302 to dev-auth.
  - `api/auth/callback.ts` — the registered redirect URI. Validates state,
    exchanges the code server side, reads identity from `userinfo`, then starts
    DevFlare's own session.
  - `api/auth/session.ts` / `logout.ts` / `user.ts` — read, end, and edit the
    local session/profile. No call leaves the Worker.
  - `api/v1/projects/index.ts` + `[id].ts` — projects CRUD, auth-gated.
  - `api/health.ts`, `api/v1/hello.ts`.
- **Server auth**: `src/server/lib/session.ts` → `getAppSession(event)` (looks up
  the hashed `df_session` cookie in D1) and `requireAuth(session)` (throws 401).
  `src/server/lib/oidc.ts` holds the OAuth client half — deliberately free of any
  h3 import, so it is unit-testable (`oidc.spec.ts`).
- **Server DB**: `src/server/db/index.ts` — db0 + the `cloudflare-d1` connector,
  bound as `DB` in `apps/devflare/wrangler.toml`. Tables `projects`,
  `deployments`, `app_user` and `app_session`. The binding is resolved lazily from `globalThis.__env__`, which
  Nitro sets per request in production and, in dev, from wrangler's
  `getPlatformProxy()` (local miniflare under `.wrangler/state`) — so there is a
  single code path. Schema lives in `src/server/db/migrations/`; apply it with
  `pnpm db:migrate:local` / `pnpm db:migrate`.
- **UI stack**: `@voltui/components` (`<volt-card>`, `<volt-button>`, `<volt-tabs>`,
  … imported as standalone classes), Tailwind CSS 4, `lucide-angular` icons.

## apps/dev-auth (identity provider)

- **Entry**: `src/index.ts` — Hono app. Middleware in `src/middleware/`:
  `cors.ts` (origins from `DEV_AUTH_CORS_ORIGINS`), `rate-limit.ts` (KV-backed,
  10 req/min/IP on credential endpoints, 60 on the OAuth ones — those get one call
  per login from a consumer's _server_), `security-headers.ts`, `session.ts`.
  Also serves `/.well-known/openid-configuration` at the issuer root.
- **Auth**: `src/auth.config.ts` — better-auth + Drizzle adapter over D1
  (`binding = "DB"`), plus the `oidc-provider` and `jwt` plugins that make this an
  OAuth 2.1 / OIDC provider (authorization code + mandatory PKCE, ES256 ID tokens,
  JWKS at `/api/auth/jwks`). `createAuthOptions(env, database)` is split out from
  `createAuth(env)` so tests run the identical config on an in-memory database.
  Schema in `src/db/schema.ts`; SQL migrations in `src/db/migrations/` (applied
  with `wrangler d1 migrations apply`).
- **Registered clients**: `src/oauth-clients.ts` parses `OAUTH_CLIENTS` (a
  `wrangler.toml` var: client id, name, type, exact redirect URIs) and
  `OAUTH_CLIENT_SECRETS` (a Worker secret). No registration endpoint, no
  dashboard, dynamic registration off. An invalid entry is dropped with a logged
  error instead of breaking sign-in for everything else.
- **Routes**: `src/routes/auth.ts` (better-auth mount), `setup.ts` (Cloudflare
  setup wizard — disabled when `ENVIRONMENT=production`), `admin.ts` (needs
  `ADMIN_SECRET` bearer), `analytics.ts`.
- **Pages (flowview pipeline — important)**: HTML for login/signup/forgot/setup/
  verify/not-found lives in `src/pages/*.flow` templates (custom syntax using
  `@andersseen/web-components` `<and-*>` elements + inline `<script>`).
  `scripts/compile-flow.mjs` compiles each `.flow` → `.flow.js` (an ES module
  importing `@flowview/runtime`); it runs automatically via the `[build] command`
  in `wrangler.toml`, or manually via `build:flow` / `watch:flow` scripts.
  The `.ts` files next to them (`login.ts`, …) are thin wrappers:
  `renderLayout({ title, body: renderBody({}) })`. **Never hand-edit `.flow.js`.**
  Compilation goes through `@flowview/compiler` (the WASM compiler on npm), so
  it works from a plain `pnpm install` — no Rust toolchain anywhere.
- **Config**: `wrangler.toml` — D1 + KV bindings, `[env.staging]` and
  `[env.production]` blocks (production/staging D1/KV IDs are placeholders until
  filled in).

## Cross-cutting

- **Env vars**: root `.env` (from `.env.sample`) for the app;
  `apps/dev-auth/.dev.vars` for Worker secrets in local dev; `wrangler secret put`
  in prod. Key vars: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `DEV_AUTH_URL`,
  `DEV_AUTH_CORS_ORIGINS`, `COOKIE_DOMAIN`, `ENVIRONMENT`.
- **CI/CD**: `.github/workflows/ci.yml` (checks), `staging.yml`, `deploy.yml`
  (push to `main` deploys). Husky pre-commit runs lint-staged
  (Prettier + ESLint on staged files).
- **Testing**: Vitest (jsdom) with colocated `*.spec.ts`; Playwright in
  `apps/devflare-e2e` and `apps/dev-auth/e2e`.
- **Deploy targets**: dev-auth → Cloudflare Workers (`auth.<domain>`); devflare →
  static/SSR build to Cloudflare Pages or similar (`app.<domain>`). Same root
  domain required for cookies. Full guide: [/DEPLOY.md](../../DEPLOY.md).
