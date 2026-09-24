# 020 — DevTools: curated toolkit + connected tools foundation

| Field   | Value                                                |
| ------- | ---------------------------------------------------- |
| Status  | Done (code complete, verified locally; not deployed) |
| Branch  | `feature/dev-tooling`                                |
| Created | 2026-09-24                                           |
| Updated | 2026-09-24                                           |

## 1. Summary

DevTools gains two kinds of tool. **Local** tools stay anonymous and
browser-only; four new ones land (OAuth/OIDC Inspector, Wrangler Config Doctor,
Security Headers Inspector, cURL ↔ Fetch). **Connected** tools need a server:
Personal Short Links (replacing the draft-only URL Shortener) and Domain
Inspector. They sign in through DevAuth and are authorized by DevTools itself.

## 2. Problem / Motivation

Spec 018 made DevTools static-only, which rules out anything that needs
persistent state (short links that actually resolve) or server-side fetching
(inspecting a domain without CORS). The URL Shortener only ever drafted aliases
that pointed nowhere. The product principle is _few tools, high quality, tools
we actually use_ — no generic filler.

## 3. Goals & Non-goals

- **Goals**
  - One DevTools app, one hostname, same-origin APIs: Worker + Static Assets,
    every page still prerendered.
  - DevTools is its own DevAuth OAuth client (`devtools-dev` / `devtools`),
    with its own `dt_session` and its own D1 (`devtools-db`).
  - **DevAuth authenticates, DevTools authorizes**: `DEVTOOLS_ALLOWED_USERS`,
    checked server side on every connected endpoint.
  - Local tools never send input anywhere; pages that are local make no
    `/api` request at all (E2E asserts it).
  - One header analyzer shared by Security Headers (pasted) and Domain
    Inspector (fetched).
  - Domain Inspector cannot be used as an SSRF proxy.
- **Non-goals**: Cloudflare Connect, BYO domain/account, organizations, click
  analytics, link expiry/passwords, JWT signature verification, a full
  Wrangler schema validator, TLS certificate inspection (Workers `fetch` does
  not expose it), more generic tools.

## 4. Design

### Deployment

`vite.config.ts` drops `static: true` for Nitro's `cloudflare-module` preset
(same shape as DevFlare). The prerender list and the `<h1>` check are
unchanged, and the two connected pages are prerendered too: they are shells
that ask the API who you are after load. Cloudflare serves every prerendered
file from Static Assets before the Worker runs, so local tools still cost no
Worker invocation. `not_found_handling` is removed — with a Worker it would
answer unknown navigations with `index.html` and the short-link redirect
would never run.

### Auth (server, `src/server/lib/`)

| File               | Role                                                              |
| ------------------ | ----------------------------------------------------------------- |
| `oidc.ts`          | `@dev-auth/core` client from `DEV_AUTH_*` vars (DevFlare's shape) |
| `session.ts`       | `dt_session` cookie: random token, SHA-256 hash stored, 7 days    |
| `authorization.ts` | pure allowlist policy (`sub` or email), `requireAllowed()`        |
| `rate-limit.ts`    | Workers Rate Limiting bindings, fails open when unbound (dev)     |
| `http.ts`          | CSRF (same-origin `Origin`/`Sec-Fetch-Site`) + error mapping      |

Routes `api/auth/{login,callback,logout,session}` mirror DevFlare's. Client
side, `@dev-auth/angular` + `@dev-auth/elements` are created **lazily** by the
connected pages only (`ConnectedSession`), so a local tool page never fetches
`/api/auth/session`. `GET /api/v1/access` → `{ user, allowed }`.

Errors: 401 anonymous, 403 not allowed, 400/422 validation, 429 rate limit,
502/504 upstream, 500 generic (no stack, no provider message).

### Data (`apps/devtools/src/server/db/migrations/`)

`app_user`, `app_session` (as DevFlare) and:

```sql
short_link(id TEXT PK, owner_user_id TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
           destination TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
           created_at TEXT NOT NULL, updated_at TEXT NOT NULL)
```

`owner_user_id` is the DevAuth `sub`; every query is scoped by it. Slugs are
globally unique because they share one public namespace.

### Short links

`GET/POST /api/v1/short-links`, `PATCH/DELETE /api/v1/short-links/:id`.
Slug `^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$`, not reserved (every tool path,
`api`, `go`, assets, well-known names). Destination: absolute `http(s)` URL,
no credentials, ≤ 2048 chars, not pointing back at the short-link host.

Public URL = `SHORT_LINK_BASE_URL + "/" + slug`. A Nitro middleware answers
requests whose host and path prefix match that base: `302` with
`Cache-Control: no-store` (editable destinations must not be cached
permanently), `404` unknown, `410` disabled. Dev base:
`http://localhost:4300/api/go` (the dev server only forwards `/api/*` to
Nitro); production: `https://go.andersseen.dev` once the domain is attached.

### Domain Inspector

`POST /api/v1/domain-inspector` `{ target }`. Hostname only (no IP literals,
no ports other than the scheme default, no credentials). DNS over HTTPS
(`cloudflare-dns.com/dns-query`, JSON) for A/AAAA/CNAME/MX/TXT/NS. HTTP probe
follows redirects manually (max 5): every hop is re-validated and its
A/AAAA answers must all be public before it is fetched; 8 s per hop; body
never read. Result headers go through the shared analyzer.

### Local tools (`src/app/tools/`)

- `oauth-inspector.service.ts` — authorization URL parse + checks, JWT decode
  (never "verified"), PKCE generate/derive/verify via Web Crypto.
- `wrangler-doctor.service.ts` — `smol-toml` / `jsonc-parser`; binding table
  tested against `node_modules/wrangler/config-schema.json`.
- `security-headers.analyzer.ts` — pure, imported by server and client.
- `curl-converter.service.ts` — POSIX-shell lexer for cURL; `acorn` AST for
  `fetch(...)` with literal-only evaluation.
- `secret-hints.ts` — flags likely secrets without mutating input.

Registry: categories `web | data | media | security | cloud`; `mode:
'local' | 'connected'`.

## 5. Constraints

Standalone Angular, signals, thin pages, SQL via `db.sql`, no secret logging.
Nx: `domain:devtools` may now depend on `domain:dev-auth-sdk`.

## 6. Test plan

Unit: every service/analyzer + server libs (session, authorization, short-link
validation/service over real migrations on `node:sqlite`, SSRF/IP rules, DNS,
probe with injected fetch/DNS, redirect middleware matching). E2E: local
pages make no `/api` call; connected pages show sign-in anonymously; the full
DevAuth round trip runs when `DEVTOOLS_E2E_AUTH=1` (needs dev-auth + seed user).

## 7. Tasks

- [x] 1. Worker + Assets build, wrangler.toml, D1, migrations, Nx boundary
- [x] 2. Auth, session, authorization, rate limit, access endpoint
- [x] 3. DevAuth client registration (`devtools-dev`, `devtools`)
- [x] 4. Header analyzer + Security Headers page
- [x] 5. OAuth/OIDC Inspector (URL, JWT, PKCE)
- [x] 6. Wrangler Doctor
- [x] 7. cURL ↔ Fetch
- [x] 8. Short links (API, redirect, page) replacing URL Shortener
- [x] 9. Domain Inspector (SSRF-safe probe, DNS, page)
- [x] 10. Registry, home IA, shell, E2E
- [x] 11. Docs (README, ARCHITECTURE, DEPLOY, STATE) and quality gates

## 8. Verification results

2026-09-24, on `feature/dev-tooling`:

- `pnpm check` green: format, lint (13 projects), typecheck (10), test (10),
  build DevFlare + DevTools. DevTools unit tests: 249 (was 23). DevTools
  typecheck now covers `src/server/**`.
- DevAuth `registered-clients.spec.ts`: the real `OAUTH_CLIENTS` of local,
  staging and production parse without errors; `devtools-dev` / `devtools`
  are confidential, PKCE-required, with one exact redirect URI, sharing no
  URI with DevFlare; production without the `devtools` secret drops only
  that entry.
- `@dev-auth/core` + `@dev-auth/client`: 39 tests, incl. the new
  `safeReturnTo` cases (`/\host`, tab, newline).
- `wrangler d1 migrations apply DB --local`: `0000_init.sql` ✅.
- `wrangler deploy --dry-run --env production`: bindings DB, 3 rate
  limiters, ASSETS, vars; 3350 KiB / **749 KiB gzip**.
- Dev server curl: session `{user:null}`; `/api/v1/access` 401; short-links
  401; cross-origin POST 403; `/api/go/nope` 404 + `no-store`; login 302 to
  DevAuth with `client_id=devtools-dev`, exact redirect URI, S256, state,
  nonce, `dt_oauth_tx` HttpOnly Lax; forged callback → `/?auth_error=invalid_state`.
- Built Worker via `wrangler dev` with `SHORT_LINK_BASE_URL=http://go.localtest`:
  `/` and tool pages from Assets; `go.localtest/cv` and `/CV/` 302 (`no-store`),
  disabled 410, unknown 404, POST 405, `/api/auth/session` passes through;
  production 401 body has no stack.
- devtools-e2e: 114 passed, 6 skipped (the opt-in DevAuth tests), chromium +
  firefox + webkit. With `pnpm dev:auth` + `pnpm seed:user` +
  `DEVTOOLS_E2E_AUTH=1`: connected suite 9/9 on chromium — real DevAuth
  sign-in, create, public 302, edit, disable (410), delete (404), Domain
  Inspector UI with a mocked API response.

Not verified: a deployed Worker (not deployed), Domain Inspector against a real
domain from Workers (covered by unit tests with injected network only), the
"access denied" screen in a browser (policy unit-tested).

## 9. Log / Deviations

- 2026-09-24: written from the owner's phase brief, which served as the
  approval; implemented on `feature/dev-tooling` at the owner's request rather
  than a `feature/020-*` branch.
- The short-link redirect is a Nitro middleware matching host + path prefix
  (not a route), so it runs before the renderer and serves a dedicated host.
  Locally the base is `/api/go` because Analog's dev server forwards only
  `/api/*` to Nitro.
- Rate limiting uses Workers Rate Limiting bindings rather than DevAuth's
  KV pattern: no extra namespace, atomic per location. Missing binding = not
  limited (logged once).
- No Domain Inspector cache: owner-only + rate-limited makes it unnecessary,
  and nothing about inspected domains is stored.
- Security pass found an open redirect in the shared SDK's `safeReturnTo`
  (backslash / control characters); fixed in `@dev-auth/core` and
  `@dev-auth/client` with tests. DevFlare benefits too; external consumers
  need an SDK release.
- `h3` added as a direct devDependency (it was only transitive via Nitro)
  so DevTools' server code type-checks.
