# ARCHITECTURE — System map

> Verified against the code on 2026-09-24 (after spec 020). If something here contradicts the code,
> the code wins — and update this file.

## Product map

"DevFlare repo" is this monorepo; "DevFlare app" is `apps/devflare` only. The
repo holds four products with separate purposes (spec 018):

```
DEVFLARE REPO
│
├── DevFlare app        apps/devflare            domain:devflare
│   └── Personal project hub: projects, their Cloudflare resources,
│       deployments. Cloud = raw infrastructure behind it. Settings holds
│       profile, integrations and (admin-only) DevAuth administration.
│
├── DevTools app        apps/devtools            domain:devtools
│   └── Curated developer tools. Local tools: anonymous, in-browser.
│       Connected tools: Worker + own D1, DevAuth sign-in (spec 020).
│
├── DevAuth             apps/dev-auth            domain:dev-auth
│   └── Identity (OAuth 2.1 / OIDC)   + SDK libs  domain:dev-auth-sdk
│
└── Cloudflare Connect  apps/cloudflare-connect  domain:cloudflare-connect
    └── Future infrastructure authorization broker (placeholder).

Shared, product-neutral code: libs/shared/ui (@org/ui — primitives and the
design tokens in src/styles/theme.css)    domain:shared
```

### Dependency boundaries

- **DevTools must not depend on DevFlare application internals**, and
  **DevFlare must not depend on DevTools application internals.** Nx already
  forbids importing an app project; the `domain:*` rules add that
  `domain:devtools` may depend only on `domain:devtools`, `domain:dev-auth-sdk`
  and `domain:shared` (so not `@org/core`, not the DevAuth app), and
  `domain:devflare` has no `domain:devtools` in its allow-list.
- Reusable code shared by both goes into a `domain:shared` library. Today that
  is only the design tokens (`libs/shared/ui/src/styles/theme.css`); each app
  keeps its own shell/navigation so the two can evolve independently.
- `@org/core` (`libs/shared/core`, `domain:devflare`) is DevFlare's platform
  logic only — projects, Cloudflare account, DevAuth admin. Tool services live
  with the tools in `apps/devtools/src/app/tools/`.
- Product placement rule: generic browser developer utility → DevTools; image
  asset platform capability → Imageryx (separate repo); project /
  infrastructure capability → DevFlare.

## Big picture

```
Browser ──► devflare (Analog/Nitro Worker, :4200 dev)
              │  /api/auth/login ─── 302 ──► dev-auth /oauth2/authorize
              │  /api/auth/callback ◄── 302 with ?code= ── dev-auth
              │        └─ back channel: POST /oauth2/token, GET /oauth2/userinfo
              │  /api/auth/session|logout|user ── devflare's OWN session (D1)
              │  /api/v1/*    ── h3 handlers ─────► Cloudflare D1 `devflare-db` (via db0)
              │  /api/v1/cloud/* ── DevFlare's OWN Cloudflare OAuth client, reading
              │        the owner's Cloudflare account (see "DevAuth ecosystem" below —
              │        this is a Cloudflare Connect migration candidate, not identity)
              │  /tools, /tools/* ── 302 to DevTools when DEVTOOLS_URL is set, else /

devtools (Worker + Static Assets, :4300 dev) — every page prerendered and served
         from Assets before the Worker runs; the Worker answers only:
              │  /api/auth/*  ── OIDC as its OWN DevAuth client (devtools[-dev])
              │  /api/v1/*    ── connected tools (short links, domain inspector)
              │                  ──► Cloudflare D1 `devtools-db` · Rate Limiting bindings
              │  short-link host (SHORT_LINK_BASE_URL) ── 302 to the destination

dev-auth (Hono Worker, :8787) — OAuth 2.1 / OIDC identity provider
         ──► Cloudflare D1 (users/sessions/issued tokens/JWKS, Drizzle schema)
         ──► Cloudflare KV  (rate limiting)

cloudflare-connect (Hono Worker) — boundary placeholder only, not implemented.
         health endpoint, no bindings, no OAuth flow. See "DevAuth ecosystem" below.
```

**dev-auth is an identity provider, not DevFlare's auth backend.** DevFlare is one
registered OAuth client of it; applications in other repositories, on unrelated
domains, register the same way. See `apps/dev-auth/README.md`.

## DevAuth ecosystem

DevAuth is not one thing — it is three related but independently usable
layers, plus a separate concern (Cloudflare Connect) that looks similar but
answers a different question and must never share a security boundary with
it. Full rationale, dependency audit, and the Nx enforcement mechanism:
[docs/specs/013-dev-auth-modular-architecture.md](../specs/013-dev-auth-modular-architecture.md).

```
domain:dev-auth        apps/dev-auth            "Who are you?" — mini Keycloak.
                              ▲ OIDC (HTTP only, never an import)
domain:dev-auth-sdk    libs/shared/dev-auth-core      framework-agnostic OIDC client (server-side)
                        libs/shared/dev-auth-client    framework-agnostic browser/session controller
                        libs/shared/dev-auth-elements  <dev-auth-sign-in>/<dev-auth-user-button>
                                                        Custom Elements (browser-side)
                        libs/shared/dev-auth-angular   Angular signals adapter over the same
                                                        @dev-auth/client AuthController
                        (libs/shared/auth-ui — unmerged, PR #32; superseded by dev-auth-elements,
                         see docs/specs/014-dev-auth-elements.md)
                              ▲ used by
domain:devflare         apps/devflare             a consumer, like any other app

domain:cloudflare-connect   apps/cloudflare-connect   "Which Cloudflare resources
                                                        can this app touch?" — a
                                                        SEPARATE deployable, not
                                                        identity. Health endpoint
                                                        only today; see its README.

domain:shared           libs/shared/ui, libs/deploy   generic infra, no domain
```

Inside `domain:dev-auth-sdk`, `dev-auth-core` (OAuth/token exchange) and
`dev-auth-client` (browser-facing app session state) are a deliberate split:
browser packages never import `dev-auth-core`, even though the Nx boundary
would allow it — token exchange must never end up reachable from a browser
bundle. `@dev-auth/angular` and `@dev-auth/elements` both depend on
`@dev-auth/client` for `AuthController`, so headless Angular consumers do not
install visual dependencies, and `<dev-auth-sign-in>`/`<dev-auth-user-button>`
stay usable with zero Angular dependency. Full rationale:
[docs/specs/016-dev-auth-hardening.md](../specs/016-dev-auth-hardening.md).

Enforced by a `domain:*` Nx tag dimension and `depConstraints` in
`eslint.config.mjs` (additive to the pre-existing `scope:`/`type:`
dimension): `dev-auth` cannot import `dev-auth-sdk`, `devflare`, or
`cloudflare-connect`; `dev-auth-sdk` cannot import `devflare` or
`cloudflare-connect`; `cloudflare-connect` cannot import `dev-auth` or
`devflare`. `devflare` (or any future consumer app) may depend on both SDKs
— composition belongs to the consumer, not to either service. `devtools` is a
consumer too (spec 020), for its connected tools only: `@dev-auth/core` on the
server, `@dev-auth/angular` + `@dev-auth/elements` in the connected pages. Its
local tools never load them.

`apps/devflare/src/server/lib/cloudflare-{oauth,oauth-client,connection}.ts`
are today's working (DevFlare-only, single-tenant) Cloudflare OAuth code —
**not yet Cloudflare Connect**. Spec 013 has the file-by-file migration map
for what moves there eventually and what needs redesigning first.

Three databases, on purpose — DevAuth → identity, DevFlare → projects and
infrastructure metadata, DevTools → its own session and short links
(`devtools-db`). **Auth data** lives in dev-auth's D1
(`dev-auth-db-prod`); **app data** (projects, deployments) plus DevFlare's own
`app_user`/`app_session` live in the app's own D1 (`devflare-db`). They only share
the user id — which is the `sub` claim dev-auth issues, so rows written before the
provider migration still resolve to the same person.

No shared cookie: DevFlare mints its own session after the flow, which is what
makes the arrangement work for a consumer on a different domain.

## Monorepo layout (Nx 22, pnpm)

| Path                            | Alias                | What it is                                                                                                                                                                    |
| ------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/devflare`                 | —                    | Main AnalogJS app (Angular 21 + Vite 7 + Nitro SSR)                                                                                                                           |
| `apps/dev-auth`                 | —                    | Identity provider — OAuth 2.1/OIDC (Hono + better-auth + D1, Workers)                                                                                                         |
| `apps/cloudflare-connect`       | —                    | **Boundary placeholder** for a future Cloudflare OAuth broker (Hono/Workers); health endpoint only, see its README                                                            |
| `apps/devflare-e2e`             | —                    | Playwright E2E tests for DevFlare                                                                                                                                             |
| `apps/devtools`                 | —                    | DevTools — browser utilities (Angular 21 + Analog, `static: true`, every route prerendered)                                                                                   |
| `apps/devtools-e2e`             | —                    | Playwright E2E tests for DevTools (needs no other service)                                                                                                                    |
| `libs/shared/core`              | `@org/core`          | DevFlare platform services: projects, Cloudflare account, DevAuth admin. No tool code                                                                                         |
| `libs/shared/ui`                | `@org/ui`            | Small shared components (badge, button, card, input) + shared design tokens (`src/styles/theme.css`)                                                                          |
| `libs/shared/dev-auth-angular`  | `@dev-auth/angular`  | DevAuth consumer SDK — Angular session adapter for a consumer app's OWN cookie session, guard, types (does not speak OAuth itself)                                            |
| `libs/shared/dev-auth-core`     | `@dev-auth/core`     | DevAuth consumer SDK — framework-agnostic OAuth 2.1/OIDC client (discovery, PKCE, code exchange, userinfo)                                                                    |
| `libs/shared/dev-auth-client`   | `@dev-auth/client`   | DevAuth consumer SDK — framework-agnostic browser session controller for a consumer app's same-origin session API                                                             |
| `libs/shared/dev-auth-elements` | `@dev-auth/elements` | DevAuth consumer SDK — `<dev-auth-sign-in>`/`<dev-auth-user-button>` Custom Elements over `@dev-auth/client` (Flowview + `@andersseen/web-components` internally, no Angular) |
| `libs/deploy`                   | `@org/deploy`        | DevFlare's deployment feature library (early stage)                                                                                                                           |

`libs/shared/auth-ui` (`@org/auth-ui`, optional Angular `DevAuthSignIn`/
`DevAuthUserButton` components) exists on an **open, unmerged** PR (#32,
`feature/012-dev-auth-angular-ui`) — not part of this checkout, and
**superseded** by `libs/shared/dev-auth-elements`, which DevFlare now
dogfoods instead. See
[docs/specs/014-dev-auth-elements.md](../specs/014-dev-auth-elements.md).

## apps/devflare (project hub)

- **Routing**: file-based. `src/app/pages/**/*.page.ts` → routes. The `(app)`
  group (auth-guarded, app shell) holds `(home).page.ts` = `/` (Projects),
  `projects/[slug].page.ts` (project detail — the central surface), `cloud/**`
  (raw infrastructure) and `settings.page.ts`. `/login` is outside the shell.
  `/dev-auth-sdk` is an internal SDK showcase, not in navigation. Pages are
  single-file standalone components with **default export**.
- **Projects model** (spec 019): a project owns N resources through
  persisted `project_resource` links (`Project 1 ── N ProjectResource`,
  types pages/worker/d1/r2/kv, keyed by the stable Cloudflare id). **DevFlare
  owns project ↔ infrastructure relationships; Cloudflare owns runtime
  truth.** `@org/core`'s `project-resources.ts` resolves each link against
  `CloudflareAccount.loadInventory()` as available / missing / unverifiable;
  `ProjectHub` loads both. `pages/(app)/dashboard-projects.ts` builds the
  views: saved projects (explicit links) plus "discovered" groups of unowned
  Workers/Pages from name heuristics — suggestions only, never ownership.
  Cloud lists/detail pages show the owner via `cloud/resource-owner.ts`.
- **Layout**: `src/app/components/layout.component.ts` + `sidebar.component.ts`,
  driven by `shell-navigation.ts` (sections: Projects, Cloud; Settings pinned
  in the sidebar footer; one external DevTools link from `VITE_DEVTOOLS_URL`,
  defaulting to `:4300` in dev).
- **Legacy `/tools/*`**: `src/server/routes/tools/` redirects to DevTools using
  the runtime `DEVTOOLS_URL` var (`src/server/lib/legacy-tools.ts`). Only the
  production Worker runs it — the Analog dev server forwards just `/api/*` to
  Nitro, so in dev an old tool URL hits the not-found redirect instead.
- **Server API** (Nitro/h3, file-based under `src/server/routes/`):
  - `api/auth/login.ts` — starts the authorization code flow (PKCE + state in a
    short-lived `df_oauth_tx` cookie), 302 to dev-auth.
  - `api/auth/callback.ts` — the registered redirect URI. Validates state,
    exchanges the code server side, reads identity from `userinfo`, then starts
    DevFlare's own session.
  - `api/auth/session.ts` / `logout.ts` / `user.ts` — read, end, and edit the
    local session/profile. No call leaves the Worker.
  - `api/v1/projects/index.ts` + `[id].ts` — projects CRUD, auth-gated;
    `[id]/resources/index.ts` (list, verified link) and
    `[id]/resources/[resourceId].delete.ts` (unlink). Thin adapters: the
    decisions live in h3-free `lib/project-service.ts` (+ `project-store.ts`
    SQL, `resource-verification.ts`), tested over the real migrations on
    `node:sqlite` via `db/sqlite-test-db.ts`.
  - `api/health.ts`, `api/v1/hello.ts`.
- **Server auth**: `src/server/lib/session.ts` → `getAppSession(event)` (looks up
  the hashed `df_session` cookie in D1) and `requireAuth(session)` (throws 401).
  `src/server/lib/oidc.ts` holds the OAuth client half — deliberately free of any
  h3 import, so it is unit-testable (`oidc.spec.ts`).
- **Server DB**: `src/server/db/index.ts` — db0 + the `cloudflare-d1` connector,
  bound as `DB` in `apps/devflare/wrangler.toml`. Tables `projects`,
  `project_resource`, `deployments`, `app_user`, `app_session`,
  `cloudflare_connection` and `cloudflare_oauth_client`. D1 enforces
  foreign keys. The binding is resolved lazily from `globalThis.__env__`, which
  Nitro sets per request in production and, in dev, from wrangler's
  `getPlatformProxy()` (local miniflare under `.wrangler/state`) — so there is a
  single code path. Schema lives in `src/server/db/migrations/`; apply it with
  `pnpm db:migrate:local` / `pnpm db:migrate`.
- **UI stack**: `@voltui/components` (`<volt-card>`, `<volt-button>`, `<volt-tabs>`,
  … imported as standalone classes), Tailwind CSS 4, `lucide-angular` icons.

## apps/devtools (curated tools: local + connected)

- **Build**: Analog + Nitro `cloudflare-module` (spec 020; was `static: true`).
  `vite.config.ts` still prerenders `/` plus every entry of
  `src/app/tools/tool-registry.ts` — connected pages too, as shells — and a
  post-render hook fails the build if a prerendered route has no `<h1>`.
  Output: `dist/apps/devtools/analog/{public,server}`; `wrangler.toml` serves
  `public` as Static Assets (matched before the Worker) and the server bundle
  as the Worker. No `not_found_handling`, or the redirect would never run.
- **Modes**: every registry entry is `mode: 'local' | 'connected'`, independent
  of `category` (`web | security | cloud | data | media`). Local pages make no
  request to DevTools' server; `src/app/connected/` (DevAuth wiring, API
  client) is imported only by connected pages.
- **Routing**: flat file-based routes, one `pages/<slug>.page.ts` per tool,
  `(home).page.ts`, not-found → `/`, `url-shortener` → `/short-links`.
- **Shell**: `components/shell.component.ts` — header, tool strip, footer. No
  auth UI; `components/connected-gate.component.ts` wraps connected tools
  (sign-in / access denied / tool).
- **Logic**: colocated services in `src/app/tools/*.service.ts` with specs.
  `security-headers.analyzer.ts` is plain TS shared with the server.
- **Server** (`src/server/`, h3, file-based):
  - `lib/oidc.ts`, `lib/session-store.ts` + `lib/session.ts` — DevTools' own
    `dt_session` (hashed in D1), created only by `api/auth/callback`.
  - `lib/authorization.ts` — `DEVTOOLS_ALLOWED_USERS` allowlist (ids/emails,
    empty = nobody); `lib/http.ts` — `requireAllowedUser` (401/403),
    same-origin + JSON CSRF check, rate limiting via `[[ratelimits]]`.
  - `lib/short-links/` — validation, owner-scoped store, redirect decision;
    `middleware/short-link-redirect.ts` answers the `SHORT_LINK_BASE_URL`
    host/prefix before the renderer (302 / 410 / 404, `no-store`).
  - `lib/domain-inspector/` — target rules, public-IP ranges, DoH, and a probe
    that re-validates and re-resolves every redirect hop (SSRF).
  - Everything under `lib/` is h3-free and unit-tested; SQL runs against the
    real migrations on `node:sqlite` (`db/sqlite-test-db.ts`).
- **DB**: `devtools-db` (binding `DB`), migrations in `src/server/db/migrations/`:
  `app_user`, `app_session`, `short_link`.
- **Browser-only deps and prerender**: `colorthief` resolves to its ESM build
  everywhere; `papaparse` is stubbed for the server bundle
  (`shims/papaparse.server.mjs`).
- **Route mapping from DevFlare**: `/tools` → `/`; `/tools/<slug>` → `/<slug>`;
  the old nav aliases `/tools/converter`, `/tools/recorder`,
  `/tools/shortener` → `/data-converter`, `/screen-recorder`, `/url-shortener`
  (which now forwards to `/short-links`).

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
  `apps/devflare-e2e`, `apps/devtools-e2e` and `apps/dev-auth/e2e`.
- **Deploy targets**: dev-auth → Cloudflare Worker (`auth-devflare.andersseen.dev`);
  devflare → Cloudflare Worker + Static Assets (`devflare.andersseen.dev`);
  devtools → Cloudflare Worker + Static Assets, **not deployed yet** (no
  domain, no CI deploy job; manual steps in DEPLOY.md › DevTools).
  Full guide: [/DEPLOY.md](../../DEPLOY.md).
