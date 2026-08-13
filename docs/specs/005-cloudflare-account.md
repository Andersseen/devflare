# 005 — Cloudflare account: see and steer your own infrastructure

| Field   | Value                            |
| ------- | -------------------------------- |
| Status  | Approved                         |
| Branch  | `feature/005-cloudflare-account` |
| Created | 2026-08-13                       |
| Updated | 2026-08-13                       |

## 1. Summary

DevFlare gains a **Cloud** section that reads the owner's real Cloudflare account
— Workers, Pages projects and their deployment history, plus the D1 / KV / R2
inventory — and lets a local project row point at the real resource it deploys
to, with re-deploy and rollback for Pages.

## 2. Problem / Motivation

DevFlare's platform half is currently theatre. `projects` is a hand-typed D1
table (`name`, `repoUrl`) that reflects nothing; `deployments` is written by
nobody; `deploy.page.ts` mounts `getMockFiles()` and fakes the upload with a
`setTimeout`. Nothing in the app has ever called `api.cloudflare.com` for the
account itself — the only calls that exist are dev-auth creating and exporting
its own D1.

The stated purpose of the platform (CONTEXT.md: a personal, zero-cost,
Cloudflare-native home for the author's products) is not served by a dashboard
that cannot see the products. This spec makes the platform tell the truth.

## 3. Goals & Non-goals

**Goals**

- A single API token, held server-side only, gives DevFlare read access to the
  account; the browser never sees it.
- `/cloud` lists every Worker and Pages project with its status, last deploy and
  domains.
- Per-resource detail: Pages deployment history (branch, commit, stage, URL) and
  Worker version history.
- `/cloud/storage` lists D1 databases, KV namespaces and R2 buckets.
- A project row can be linked to a real Worker or Pages project.
- Pages: re-deploy the production branch, and roll back to an earlier deployment.
- Everything degrades to an explicit "connect your account" state when the token
  is absent, instead of erroring.

**Non-goals**

- Touching `deploy.page.ts`. The WebContainer mock stays exactly as it is; a real
  build pipeline is a separate spec.
- Any destructive write: no deleting deployments, projects, databases or buckets.
- Editing environment variables or secrets from the UI.
- GraphQL Analytics (requests/errors/CPU per Worker). Deferred.
- Multi-account or multi-tenant. This is single-account by construction.

## 4. Design

### Configuration

| Name                    | Kind   | Where                                                                  |
| ----------------------- | ------ | ---------------------------------------------------------------------- |
| `CLOUDFLARE_ACCOUNT_ID` | var    | `[vars]` + `[env.production.vars]` in `wrangler.toml`                  |
| `CLOUDFLARE_API_TOKEN`  | secret | `apps/devflare/.dev.vars` locally, `wrangler secret put` in production |

Read through the same `context.cloudflare?.env?.[key] ?? process.env[key]` helper
that `server/lib/oidc.ts` and `server/lib/devauth-admin.ts` already use — on
Cloudflare, vars arrive as a per-request binding, not as `process.env`.

Token scopes (account-level): `Workers Scripts:Read`, `Cloudflare Pages:Edit`
(Edit is what phase 4's re-deploy/rollback needs; `Read` suffices for phases
1–3), `D1:Read`, `Workers KV Storage:Read`, `Workers R2 Storage:Read`.

### Server

`server/lib/cloudflare.ts` — plain module, no h3 import, same shape as
`devauth-admin.ts`:

- `resolveCloudflareConfig(context)` → `{ accountId, token }`, throws
  `CloudflareApiError(…, 503)` when either is missing.
- `cfFetch<T>(config, path, init?)` — prefixes `/accounts/{id}`, unwraps the
  `{ success, errors, result }` envelope, turns `success: false` into a
  `CloudflareApiError` carrying the first error's message and code.
- A module-scope TTL memo (60s, GET only, bypassed by `?refresh=1`) so moving
  between Cloud pages does not re-hit the API on every navigation.

`server/lib/cloud-admin.ts` — `requireCloudAdmin(event)`. The token can see the
whole account, so a signed-in session is not enough. Admin status is asked of
dev-auth via the existing `callDevAuthAdmin` path (DevFlare must not grow a
second admin list — see `api/admin/whoami.ts`), memoized 60s per email so it
costs one extra fetch per minute rather than one per request.

Routes under `src/server/routes/api/v1/cloud/`:

| Route                           | Method | Returns                                     |
| ------------------------------- | ------ | ------------------------------------------- |
| `status.ts`                     | GET    | `{ configured, accountId? }` — never errors |
| `workers/index.ts`              | GET    | scripts + their custom domains              |
| `workers/[name].ts`             | GET    | versions/deployments for one script         |
| `pages/index.ts`                | GET    | projects + `latest_deployment`              |
| `pages/[name].ts`               | GET    | deployment history for one project          |
| `pages/[name]/deploy.post.ts`   | POST   | new deployment of the production branch     |
| `pages/[name]/rollback.post.ts` | POST   | `{ deploymentId }` → rollback               |
| `storage.ts`                    | GET    | `{ d1[], kv[], r2[] }`                      |

Upstream endpoints: `/workers/scripts`, `/workers/domains`,
`/workers/scripts/{name}/versions`, `/pages/projects`,
`/pages/projects/{name}/deployments`, `…/deployments/{id}/rollback`,
`/d1/database`, `/storage/kv/namespaces`, `/r2/buckets`.

### Client

`libs/shared/core/src/lib/services/cloudflare-account.service.ts` — class
`CloudflareAccount`, `providedIn: 'root'`, `fetch` with `credentials: 'include'`,
mirroring `projects.service.ts`. Owns the typed shapes and the pure presentation
helpers (deployment stage → badge variant, relative "2h ago"), which is what the
colocated `.spec.ts` tests.

Pages (AnalogJS file-based, `export default class`, signals, thin):

| File                                     | Route                  |
| ---------------------------------------- | ---------------------- |
| `app/pages/cloud/(cloud).page.ts`        | `/cloud`               |
| `app/pages/cloud/workers/[name].page.ts` | `/cloud/workers/:name` |
| `app/pages/cloud/pages/[name].page.ts`   | `/cloud/pages/:name`   |
| `app/pages/cloud/storage.page.ts`        | `/cloud/storage`       |

Navigation: two items in the Deployment section's Platform group in
`components/shell-navigation.ts`, and `/cloud` added to that section's `matches`.

### DB (phase 4)

`src/server/db/migrations/0002_project_cloudflare_link.sql`:

```sql
ALTER TABLE projects ADD COLUMN cfType TEXT;  -- 'worker' | 'pages'
ALTER TABLE projects ADD COLUMN cfName TEXT;
```

Additive and replayable-safe; existing rows keep working with both columns null.

### Decisions & trade-offs

- **Server-side proxy, not direct browser calls.** An account-wide token in the
  browser would be handing out the account. Same reasoning as `devauth-admin.ts`.
- **Admin-gated, not session-gated.** Read access here is read access to
  everything the author runs.
- **No local mirror of Cloudflare state.** Cloudflare is the source of truth;
  DevFlare caches for 60s and stores only the link (`cfType`/`cfName`). A synced
  copy would be a second thing that can be wrong.
- **Workers get no re-deploy button.** A Worker deploy needs a build artifact;
  Pages has a git-connected build that the API can retrigger. Symmetry here would
  be a lie about what the button does.

## 5. Constraints

- CONVENTIONS.md throughout: standalone components, signals (no RxJS for state),
  `inject()`, thin pages delegating to `@org/core`, `db.sql` tagged templates,
  `createError` for h3 errors, Volt components before custom markup.
- No new runtime dependencies — `fetch` is enough.
- The token must never reach a template, a client bundle, or a log line.
- One branch, one PR: four phases = four commits, not four branches.

## 6. Test plan

**Unit (Vitest)**

- `server/lib/cloudflare.spec.ts` — config resolution (binding beats
  `process.env`, missing token → 503), envelope unwrapping, `success: false` →
  `CloudflareApiError`, memo hit/expiry/bypass.
- `libs/shared/core/…/cloudflare-account.service.spec.ts` — presentation helpers.

**Manual**

1. `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` in `apps/devflare/.dev.vars`,
   `pnpm dev:all`.
2. `curl -s localhost:4200/api/v1/cloud/status` → `{"configured":true,…}`.
3. `/cloud` lists the real Workers (`devflare`, `dev-auth`, …) and Pages projects.
4. Unset the token → `/cloud` shows the connect state, no stack trace.
5. Sign in as a non-admin → the Cloud nav items are absent and the API answers 403.
6. Phase 4: link a project, hit re-deploy, confirm a new deployment appears in
   the Cloudflare dashboard.

## 7. Tasks

- [x] **Phase 1 — server foundation.** `cloudflare.ts` + `cloud-admin.ts` +
      spec, read routes (`status`, `workers`, `pages`, `storage`), wrangler vars.
- [x] **Phase 2 — overview UI.** `CloudflareAccount` service + spec, `/cloud`
      page with Workers and Pages, connect state, nav entries.
- [x] **Phase 3 — detail + storage.** Per-resource routes and pages, deployment
      history, `/cloud/storage`.
- [x] **Phase 4 — link + actions.** Migration `0002`, projects API and page carry
      the link, Pages re-deploy and rollback with confirmation.
- [x] 5. Quality gates: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`
- [ ] 6. Manual verification (section 6) — **blocked on the owner creating the
     API token**; steps 1–3 and 6 cannot run without it. Everything reachable
     without a token was verified (section 8).
- [x] 7. Update `docs/ai/STATE.md` + the index in `docs/specs/README.md`

## 8. Verification results

**Automated** — `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`
all pass: 59 tests across three projects — 45 in `devflare` (14 new in
`cloudflare.spec.ts`, 7 new in `project-rows.spec.ts`), 8 in `core`, which had
no test target at all before this branch, and 6 in `dev-auth`, untouched.
`pnpm nx build devflare` succeeds and emits all four Cloud page chunks.

**Manual, without a token** (`pnpm dev:app`, migration `0002` applied `--local`):

| Check                                                                    | Result                                                     |
| ------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `GET /api/v1/cloud/status` signed out                                    | `{"admin":false,"configured":false,"reason":"signed-out"}` |
| `GET /api/v1/cloud/workers` signed out                                   | 401                                                        |
| `GET /api/v1/cloud/storage` signed out                                   | 401                                                        |
| `/cloud`, `/cloud/storage`, `/cloud/pages/:name`, `/cloud/workers/:name` | 200, SSR renders                                           |
| Cloud + Storage in the sidebar                                           | present in the served HTML                                 |
| `wrangler d1 migrations apply --local`                                   | applied, 3 commands OK                                     |

**Not verified** — anything that needs a real `CLOUDFLARE_API_TOKEN`: the
listings, the storage inventory, and the deploy/rollback calls. The last one is
the least certain of the set: `POST /pages/projects/{name}/deployments` is sent
with no body, which is what triggers a production-branch build for a
git-connected project; if the API turns out to want multipart, the button will
surface Cloudflare's own error and the fix is local to `deploy.post.ts`.

## 9. Log / Deviations

- **2026-08-13** — Scope set with the owner: all read surfaces including
  D1/KV/R2; writes limited to Pages re-deploy and rollback; `deploy.page.ts`
  left untouched; analytics deferred.
- **2026-08-13** — Three things the spec did not anticipate, all found by
  running the app rather than by building it:
  1. **Routing is not file-based.** `app.routes.ts` is an explicit table; a new
     `*.page.ts` compiles into its own chunk and is unreachable until it is
     registered there. AGENTS.md said otherwise and has been corrected.
  2. **`lib/projects.ts` cannot exist.** Imported from
     `routes/api/v1/projects/*` it breaks the Nitro **dev** server for every
     route (`Could not resolve "../../../../lib/projects"`) while the
     production build resolves it fine. Renamed to `project-rows.ts`.
  3. **The projects API was already broken.** db0's `sql` template answers a
     SELECT with `{ rows, success }`, and both project routes read `.length`
     off that envelope — so the list came back as an object the page could not
     iterate, and GET/DELETE of one project always 404'd. Fixed here rather
     than left: phase 4 links rows that the list must first be able to show.
- **2026-08-13** — Volt's installed badge (0.5.0) takes no `class` input, so
  deployment status is a small local component with explicit Tailwind classes
  instead. Same reason the project link control is a plain `<select>` carrying
  Volt's own input classes: the installed `VoltNativeSelect` is a component with
  content projection, while the library source has it as a directive — the two
  disagree, and this branch should not bet on which one ships.
