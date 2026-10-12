# 021 — DevRadar v0.1.0: GitHub monitoring foundation

| Field   | Value                                               |
| ------- | --------------------------------------------------- |
| Status  | Done (verified locally; owner provisioning pending) |
| Branch  | `feature/dev-radar-foundation`                      |
| Created | 2026-10-12                                          |
| Updated | 2026-10-12                                          |

> Authorization note: the owner asked for direct implementation, so this spec
> was written and implemented in one pass without a separate approval stop.

## 1. Summary

A fifth product, **DevRadar** (`apps/dev-radar`, Nx `dev-radar`, :4400): an
independent AnalogJS app + Cloudflare Worker + own D1 that monitors GitHub
repositories — state, open PRs, Actions results, releases and recent activity —
through a **read-only GitHub App**, signing users in via **DevAuth**.

## 2. Problem / Motivation

DevFlare knows where projects deploy; nothing shows, in one place, whether the
repositories behind them are healthy. DevRadar is that view, and the event
boundary a later automation engine (v0.2.0) can hang off. It must not leak into
DevFlare (Cloudflare hub), DevTools (utilities) or DevAuth (identity only).

## 3. Goals & Non-goals

- **Goals**
  - Independent Nx app, own Worker, own D1, own DevAuth OAuth client.
  - Access policy = DevAuth identity **and** `DEVRADAR_ALLOWED_USERS` (fail closed).
  - GitHub App auth (JWT → short-lived installation token, server only);
    installation discovery, repo/PR/workflow-run/release sync with pagination,
    rate-limit and error handling.
  - Verified (`X-Hub-Signature-256`), idempotent webhook endpoint for
    `installation`, `installation_repositories`, `push`, `pull_request`,
    `workflow_run`, `release`; normalized typed domain events.
  - Dashboard: Overview, Repositories (+ detail), Pull Requests, Activity, Settings.
  - Honest CI state: `none` / `unknown` / `pending` / `success` / `failure`.
  - Tests (unit + Playwright), CI wiring, docs.
- **Non-goals**: AI/prompt generation, automation engine, any GitHub write
  permission (merge, rerun, mutate), other Git hosts, Devflare↔repo linking,
  multi-tenant access, notifications, commit-status/check-run (non-Actions) CI.

## 4. Design

**Boundaries.** `domain:dev-radar` may depend on `domain:dev-radar`,
`domain:dev-auth-sdk`, `domain:shared` only. No `@org/core`. DevFlare gets one
configurable external link (`VITE_DEVRADAR_URL`), like DevTools'.

**Layout** (`apps/dev-radar`):

| Path                       | Purpose                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `src/shared/`              | Types shared by browser + server: DTOs, CI-state calculation, domain events                                  |
| `src/server/db/`           | db0/D1 binding, migrations, in-memory SQLite test harness                                                    |
| `src/server/lib/` (auth)   | env, oidc, authorization, session(-store), http guards (copied pattern of DevTools, own cookie `dr_session`) |
| `src/server/lib/github/`   | App JWT, installation tokens, REST client, response mapping                                                  |
| `src/server/lib/webhooks/` | signature, normalization, persistence/processing                                                             |
| `src/server/lib/sync/`     | installation/repository synchronization, reconcile                                                           |
| `src/server/lib/store/`    | SQL reads/writes (the only place that knows the schema)                                                      |
| `src/server/routes/`       | thin h3 adapters: `api/auth/*`, `api/v1/*`, `api/github/webhook.post.ts`                                     |
| `src/app/`                 | shell, pages, `RadarApi`/`RadarAccess` services, UI components                                               |

**Why no Octokit.** The surface is six read-only GETs plus two App endpoints.
A ~150-line typed client over `fetch` + WebCrypto (RS256 JWT) runs unchanged in
Workers, adds no dependency, and is trivially faked in tests. The PEM may be
PKCS#1 (what GitHub issues) or PKCS#8; PKCS#1 is wrapped at runtime.

**Data (own D1, GitHub numeric ids as keys):** `app_user`, `app_session`,
`github_installations`, `repositories`, `pull_requests` (open only),
`workflow_runs` (latest 50/repo), `releases` (latest 10/repo),
`webhook_deliveries` (14 days), `repository_events` (30 days, 200/repo).
Renames/transfers update `full_name`; ids never change.

**CI state** (`src/shared/ci-state.ts`): take the default-branch commit that
most recently ran workflows, newest attempt per workflow; any failing run →
`failure`; else any unfinished → `pending`; else `success`; cancelled/skipped
are ignored; no runs → `none` (never shown as passing); no data → `unknown`.
The `ci_sha` is stored so the UI can flag "CI is for an older commit".
Success of a push is never inferred as CI success.

**Webhooks** (`POST /api/github/webhook`): HMAC-SHA256 over the raw body,
constant-time compare → 401. `INSERT OR IGNORE` the delivery id; processed
deliveries return 200 `duplicate`; failed ones are retried by GitHub redelivery
(max 5 attempts). Cheap state changes apply inline from the payload, guarded by
`updated_at` so stale/out-of-order deliveries cannot regress newer state; full
installation syncs run in `waitUntil`. Domain events (`repository.main.updated`,
`repository.ci.passed|failed`, `pull_request.opened|merged|closed`,
`release.published`, `installation.*`, `repository.added|removed`) go through a
`DomainEventSink` — v0.1.0's sink stores them in `repository_events`.

**Sync & reconciliation.** Initial sync on `installation.created` / first
manual run; protected `POST /api/v1/sync`; a Cron Trigger reconciles every 6h
(missed webhooks). Per run a request budget (`GITHUB_SYNC_REQUEST_BUDGET`,
default 45 — fits Workers' free-plan subrequest cap) is spent on the
least-recently-synced repos first, concurrency 3; the rest wait for the next
run. An installation lease prevents overlapping syncs. Rate limits stop the run
and record `sync_error` with the reset time. Dashboard reads only D1.

**API** (all session + allowlist guarded except noted): `GET /api/v1/overview`,
`/repositories`, `/repositories/:id`, `/pull-requests`, `/activity`,
`/settings`, `POST /api/v1/sync` (same-origin JSON + rate limit). `/api/auth/*`
as DevTools; `/api/github/webhook` is public but signature-gated.

**GitHub App permissions (read-only):** Metadata, Contents, Pull requests,
Actions (all read). Events: installation, installation_repositories, push,
pull_request, workflow_run, release. Documented in the app README.

## 5. Constraints

CONVENTIONS apply: standalone/signals/OnPush, `db.sql` only, thin routes,
no cross-app imports, no secrets committed, no GitHub write scopes, no
production deploy. Mock data exists only in automated tests and the local
E2E database — never in app code paths.

## 6. Test plan

Vitest: signature, delivery idempotency/replay, normalization, API mapping,
pagination, rate-limit/error handling, sync, persistence (real migrations on
in-memory SQLite), CI state, authorization, session store, filtering, key
UI states. Playwright (`dev-radar-e2e`): anonymous gate, unauthenticated API
401, bad-signature webhook 401, seeded signed-in connected view, signed
webhook → Activity, disconnected presentation.

## 7. Tasks

- [x] 1. Spec + branch
- [x] 2. Scaffold app, Nx, wrangler, D1 migration
- [x] 3. Auth (DevAuth client, session, allowlist, guards)
- [x] 4. GitHub client, mapping, App auth
- [x] 5. Store, sync, webhooks, domain events
- [x] 6. API routes
- [x] 7. Dashboard UI
- [x] 8. DevFlare link, DevAuth client registration, scripts, CI
- [x] 9. E2E project
- [x] 10. Docs (README, ARCHITECTURE, CONTEXT, STATE, root README, DEPLOY)
- [x] 11. Quality gates, PR

## 8. Verification results

Run on 2026-10-12 from the repo root (the same chain as `.github/workflows/ci.yml`):

- `pnpm format:check` ✔ · `nx run-many -t lint` ✔ (15 projects, 0 errors) ·
  `-t typecheck` ✔ · `-t test --coverage` ✔ (dev-radar **204** tests in 17
  files; devtools 249; devflare 192; dev-auth-core+client 39; elements 52;
  deploy 65; core 19; angular 11) · `-t build` ✔ (dev-radar: 5 prerendered
  routes, Worker bundle, `radar:reconcile` task bundled) ·
  `wrangler deploy --env production --dry-run` ✔ (bindings: D1, 2 rate
  limiters, assets; 1.5 MiB / 331 KiB gzip).
- `nx run-many -t e2e --parallel=1 --skip-nx-cache` ✔: dev-radar-e2e **93**
  (31 specs × chromium/firefox/webkit), devtools-e2e 114 (+6 skipped),
  devflare-e2e 45.
- Local D1 migration applied through wrangler/miniflare; dev server probed with
  curl: every `/api/v1/*` 401 anonymous; webhook with no/forged signature 401,
  valid ping `{"result":"ignored"}`, replay `{"result":"duplicate"}`, missing
  delivery header 400, signed push for an unknown repository ignored.
- Secret scan of the diff and new files: no keys/tokens (only the string
  "BEGIN RSA PRIVATE KEY" in docs/tests). `.dev.vars` and `.wrangler/` stay
  ignored.

**Not verified:** anything against real GitHub (no App exists), and a completed
DevAuth sign-in (needs `OAUTH_CLIENT_SECRETS["dev-radar-dev"]` in the tracked
`apps/dev-auth/.dev.vars`, deliberately not touched). **Observed flake:** one
full-chain run had two DevTools Wrangler Doctor specs time out on a cold dev
server and one run abort without a summary; three uncached reruns and a
pristine-`main` run pass. Not caused by this change as far as can be shown;
not investigated further.

## 9. Log / Deviations

- 2026-10-12: implementation started in the same pass as the spec (owner
  authorized direct implementation).
- **No Octokit** (spec §4): a small typed `fetch` client instead — see the
  README for why. PKCS#1 → PKCS#8 wrapping is done at runtime (tested against
  Node's own export).
- **CI = Actions workflow runs only.** Commit statuses / third-party check
  runs are not read (stated in the README). PR review state and mergeability
  are omitted rather than guessed.
- **Cron:** Nitro `scheduledTasks` + wrangler `[triggers] crons`; the two
  schedules must be kept equal (comment in both files). Verified bundled, not
  executed on Cloudflare.
- **Tests found real defects:** sync lease ownership compared timestamps (fixed
  with a random token column); DevAuth's `registered-clients.spec.ts` pins the
  production client set and had to learn about `dev-radar`.
- E2E uses a seeded throwaway local D1 (`apps/dev-radar-e2e/fixtures/seed.mjs`)
  instead of any test hook in the app; "disconnected" is exercised by stubbing
  API responses in the browser.
- CI workflow files unchanged: `nx run-many` already includes both new projects
  (confirmed in the step logs). Coverage upload paths were not extended.
