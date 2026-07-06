# ARCHITECTURE — System map

> Verified against the code on 2026-07-06. If something here contradicts the code,
> the code wins — and update this file.

## Big picture

```
Browser ──► devflare (AnalogJS/Nitro, :4200)
              │  /api/auth/*  ── catch-all proxy ──► dev-auth (Hono Worker, :8787)
              │  /api/v1/*    ── h3 handlers ─────► SQLite (data/devflare.db via db0)
              │
              └─ session check: server calls GET {DEV_AUTH_URL}/api/auth/get-session
                 forwarding the request cookies (see auth-remote.ts)

dev-auth ──► Cloudflare D1 (users/sessions, Drizzle schema)
         ──► Cloudflare KV  (rate limiting)
```

Two databases, on purpose: **auth data** lives in dev-auth's D1; **app data**
(projects, deployments) lives in the main app's SQLite. They only share the
`userId` string.

## Monorepo layout (Nx 22, pnpm)

| Path                | Alias         | What it is                                                         |
| ------------------- | ------------- | ------------------------------------------------------------------ |
| `apps/devflare`     | —             | Main AnalogJS app (Angular 21 + Vite 7 + Nitro SSR)                |
| `apps/dev-auth`     | —             | Auth microservice (Hono + better-auth + D1, Cloudflare Workers)    |
| `apps/devflare-e2e` | —             | Playwright E2E tests                                               |
| `libs/shared/core`  | `@org/core`   | Tool services (one per tool) + auth/projects/webcontainer services |
| `libs/shared/ui`    | `@org/ui`     | Small shared components (badge, button, card, input)               |
| `libs/shared/auth`  | `@org/auth`   | better-auth client, auth guard, auth service, types                |
| `libs/deploy`       | `@org/deploy` | Deployment library (early stage)                                   |

## apps/devflare (main app)

- **Routing**: file-based. `src/app/pages/**/*.page.ts` → routes. `(home).page.ts`
  is `/`, `tools/qr-generator.page.ts` is `/tools/qr-generator`, etc. Pages are
  single-file standalone components with **default export**.
- **Layout**: `src/app/components/layout.component.ts` + `sidebar.component.ts`.
- **Server API** (Nitro/h3, file-based under `src/server/routes/`):
  - `api/auth/[...slug].ts` — **catch-all proxy** forwarding `/api/auth/*` to
    `DEV_AUTH_URL` (default `http://localhost:8787`). It rewrites the `Origin`
    header to the auth URL and forwards `Set-Cookie` back. This — not a Vite
    proxy — is how auth reaches the browser in both dev and prod-SSR.
  - `api/v1/projects/index.ts` + `[id].ts` — projects CRUD, auth-gated.
  - `api/health.ts`, `api/v1/hello.ts`.
- **Server auth**: `src/server/lib/auth-remote.ts` → `getRemoteSession(event)`
  (calls dev-auth `get-session` with forwarded cookies, returns `null` on any
  failure) and `requireAuth(session)` (throws 401).
- **Server DB**: `src/server/db/index.ts` — db0 + better-sqlite3, file
  `data/devflare.db` at repo root. Tables `projects` and `deployments`, created
  on module import. No migration system — schema changes are edits to
  `initDatabase()`.
- **UI stack**: `@voltui/components` (`<volt-card>`, `<volt-button>`, `<volt-tabs>`,
  … imported as standalone classes), Tailwind CSS 4, `lucide-angular` icons.

## apps/dev-auth (auth microservice)

- **Entry**: `src/index.ts` — Hono app. Middleware in `src/middleware/`:
  `cors.ts` (origins from `DEV_AUTH_CORS_ORIGINS`), `rate-limit.ts` (KV-backed,
  ~10 req/min/IP on auth endpoints), `security-headers.ts`, `session.ts`.
- **Auth**: `src/auth.config.ts` — better-auth + Drizzle adapter over D1
  (`binding = "DB"`). Schema in `src/db/schema.ts`; SQL migrations in
  `src/db/migrations/` (applied with `wrangler d1 migrations apply`).
- **Routes**: `src/routes/auth.ts` (better-auth mount), `setup.ts` (Cloudflare
  setup wizard — disabled when `ENVIRONMENT=production`), `admin.ts` (needs
  `ADMIN_SECRET` bearer), `analytics.ts`.
- **Pages (Flowmark pipeline — important)**: HTML for login/signup/forgot/setup/
  verify/not-found lives in `src/pages/*.flow` templates (custom syntax using
  `@andersseen/web-components` `<and-*>` elements + inline `<script>`).
  `scripts/compile-flow.mjs` compiles each `.flow` → `.flow.js` (an ES module
  importing `@flowview/runtime`); it runs automatically via the `[build] command`
  in `wrangler.toml`, or manually via `build:flow` / `watch:flow` scripts.
  The `.ts` files next to them (`login.ts`, …) are thin wrappers:
  `renderLayout({ title, body: renderBody({}) })`. **Never hand-edit `.flow.js`.**
  Compilation requires the `flowmark` CLI binary (Rust; see STATE.md).
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
