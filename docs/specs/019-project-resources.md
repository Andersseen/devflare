# 019 — Project resources: explicit ownership of Cloudflare infrastructure

| Field   | Value                                                   |
| ------- | ------------------------------------------------------- |
| Status  | Done (code + tests; production migration runs on merge) |
| Branch  | `feature/project-resources`                             |
| Created | 2026-09-24                                              |
| Updated | 2026-09-24                                              |

## 1. Summary

A DevFlare project owns any number of Cloudflare resources — Pages, Workers,
D1, R2, KV — through persisted `project_resource` links. The single
`cfType`/`cfName` pair is migrated and removed.

```
Project 1 ──── N ProjectResource { provider, type, resourceId, resourceName }
```

**DevFlare owns project ↔ infrastructure relationships. Cloudflare owns
infrastructure runtime truth.**

## 2. Problem

`projects` could hold one link (spec 005). The dashboard grouped several
Workers/Pages per project, but only through name matching
(`WATCHED_PROJECTS` in `dashboard-projects.ts`) — a guess, not ownership, and
saved projects without a link were not shown at all. Health/activity work
needs an unambiguous answer to "what belongs to this project?" first.

## 3. Goals & Non-goals

- **Goals**: many resources per project; five types; stable identifiers;
  verified links; one owner per resource; legacy data migrated; missing and
  unverifiable resources visible; one API used by the project page, the
  dashboard and the Cloud views; creation needs only a name.
- **Non-goals**: health, polling, analytics, logs, alerts; new Cloudflare
  products (Queues, DO, …); GitHub integration; Cloudflare Connect; DevTools
  and DevAuth changes.

## 4. Design

**Schema** — `apps/devflare/src/server/db/migrations/0005_project_resource.sql`:
`project_resource(id, projectId → projects ON DELETE CASCADE, provider CHECK
'cloudflare', type CHECK IN (worker,pages,d1,r2,kv), resourceId, resourceName,
createdAt)`, `UNIQUE(provider, type, resourceId)`, index on `projectId`. The
legacy pair is copied in, then `cfType`/`cfName` are dropped (one source of
truth).

**Stable identifiers** (read from the repo's own Cloudflare contracts in
`server/lib/cloudflare.ts`):

| type   | `resourceId`       | `resourceName` (label at link time) | why                                                  |
| ------ | ------------------ | ----------------------------------- | ---------------------------------------------------- |
| worker | script name (`id`) | script name                         | the only id the scripts API and every route use      |
| pages  | project name       | project name                        | the API's path key; Pages projects cannot be renamed |
| d1     | database `uuid`    | database name                       | the name is a label; the uuid is stable              |
| kv     | namespace `id`     | namespace `title`                   | titles can be renamed                                |
| r2     | bucket name        | bucket name                         | the bucket's key; buckets cannot be renamed          |

**Ownership policy** — one resource belongs to at most one project across the
install (the unique index; the Cloudflare account is install-wide). Sharing
would make future health/activity ambiguous. A conflict names the other
project only to its owner.

**Deletion** — deleting a project deletes its links (cascade, also explicit)
and its own `deployments` rows (their FK had no `ON DELETE`, so a deployed
project could not be deleted before). Cloudflare is never touched. Unlinking
never needs Cloudflare access.

**API** (`server/routes/api/v1/projects/**`, thin h3 adapters over the
h3-free `server/lib/project-service.ts`):

| Method | Path                                     | Body / result                                          |
| ------ | ---------------------------------------- | ------------------------------------------------------ |
| GET    | `/api/v1/projects`                       | `{ projects: Project[] }`, each with `resources[]`     |
| POST   | `/api/v1/projects`                       | `{ name, repoUrl? }` → 201 `{ project }`               |
| GET    | `/api/v1/projects/:id`                   | `{ project }`                                          |
| PATCH  | `/api/v1/projects/:id`                   | `{ name?, repoUrl? }` (no longer the link)             |
| DELETE | `/api/v1/projects/:id`                   | `{ success }`                                          |
| GET    | `/api/v1/projects/:id/resources`         | `{ resources }`                                        |
| POST   | `/api/v1/projects/:id/resources`         | `{ provider?, type, resourceId }` → 201 `{ resource }` |
| DELETE | `/api/v1/projects/:id/resources/:linkId` | `{ success }` (`:linkId` = `resources[].id`)           |

All session-gated; another user's project is a 404. Link refusals carry
`data.reason`: `invalid` 400, `conflict` 409, `not-found` 422 (Cloudflare
listed the product, the resource was not in it), `unverifiable` 403/503 (the
listing was refused for permission, the caller is not a Cloud admin, or no
account is connected). **No link is written unless Cloudflare confirmed it** —
the display name also comes from Cloudflare, not the browser.
`repoUrl` is normalised (`owner/repo`, SSH remotes, `.git`, trailing slash →
`https://host/owner/repo`); non-http(s) values are refused.

**Resolution** (`libs/shared/core/.../project-resources.ts`, pure): each link
is resolved against `CloudflareAccount.loadInventory()` (five products, each
with its own error) as `available`, `missing` (listed product, resource
absent — still shown, with unlink) or `unverifiable` (product unreadable or no
inventory — reason shown, never "0").

**Heuristics** (`dashboard-projects.ts`): explicit links always win. Unowned
resources whose names resemble a saved project are _suggestions_ on its page
(one-click Link). Remaining unowned Workers/Pages form "Discovered in
Cloudflare" cards (not saved); "Save as project" creates the project and links
each resource through the same verified API.

**UI** — dashboard: saved projects with counts from explicit ownership
("2 Workers · 1 Pages / 1 D1 · 2 R2") and a needs-attention flag; creation is
name + optional repo. `/projects/:slug` (also accepts the project id):
Overview, Resources (Web / Compute / Storage, "Link resource" checklist panel,
suggestions), Deployments of owned Pages projects (redeploy/rollback kept),
Actions (edit, delete). Cloud lists and detail pages show
`Project: <name>` or "Not linked to a project · Link to project".
DevFlare-made Pages deployments without a `projectId` are filed under the
project that explicitly owns that Pages project.

## 5. Constraints

No new dependencies or UI libraries (Volt + native checkbox/select). Server
logic h3-free for tests. No DevTools / DevAuth / Cloudflare Connect changes.

## 6. Test plan

- `server/db/migrations.spec.ts` — real SQL files on `node:sqlite`: legacy
  migration, half links, column drop, rollback on duplicate claims,
  constraints, cascade.
- `server/lib/project-service.spec.ts` — API decisions over SQLite: auth,
  isolation, link/unlink, validation, not-found vs unverifiable, conflicts.
- `server/lib/project-rows.spec.ts`, `resource-verification.spec.ts`.
- `libs/shared/core/.../project-resources.spec.ts` — resolution states.
- `pages/(app)/dashboard-projects.spec.ts` — explicit over heuristic.
- `pages/(app)/projects/project-resources-ui.spec.ts` — rendering.
- `apps/devflare-e2e/src/project-resources.spec.ts` — link → count → unlink.

**Production migration** (runs automatically: `deploy.yml` applies D1
migrations before deploying the app). Preflight, run once before merging:

```sh
pnpm cf:app d1 execute DB --env production --remote --command \
  "SELECT cfType, trim(cfName) AS name, COUNT(*) FROM projects
   WHERE cfType IS NOT NULL GROUP BY cfType, trim(cfName) HAVING COUNT(*) > 1"
```

Any row means two projects claim one resource: 0005 would fail (and roll
back, leaving production on the old schema and old code). Clear one claim
(`UPDATE projects SET cfType = NULL, cfName = NULL WHERE id = '…'`) and re-run
the deploy. Manual apply: `pnpm db:migrate:app`.

## 7. Tasks

- [x] 1. Migration 0005 + migration tests
- [x] 2. Server: rows/store/service/verification, routes, publish attribution
- [x] 3. `@org/core`: types, `Projects` API, inventory, resolution helpers
- [x] 4. Dashboard, project page, Cloud ownership
- [x] 5. Unit, UI and E2E tests; quality gates
- [x] 6. Docs (this spec, ARCHITECTURE, STATE)

## 8. Verification results

2026-09-24, on `feature/project-resources`:

- `pnpm check` — format, lint (13 projects), typecheck (10), test (10),
  build (DevFlare + DevTools): all green.
- Unit: DevFlare 191 tests (migrations 10, project service 20, rows 12,
  verification 5, grouping 23, UI components 10, …), `@org/core` 19,
  DevTools 23 (unchanged).
- E2E: `apps/devflare-e2e` 45/45 on chromium, firefox, webkit, including the
  three new project-resources flows.
- Local D1 (wrangler/miniflare, throwaway config): 0000–0004 applied, four
  legacy rows inserted (pages link, worker link with padded name, unlinked,
  half-linked) plus a deployment row; 0005 applied → two `project_resource`
  rows (`pages ally`, `worker devflare`), four projects kept, `projects`
  columns `id, userId, name, repoUrl, createdAt`, `foreign_keys = 1`.
  Duplicate claim run: `UNIQUE constraint failed`, no `project_resource`
  table, `cfType`/`cfName` intact, last recorded migration still 0004.
- Not run: production migration (on merge), signed-in walk on the live
  account.

## 9. Log / Deviations

- 2026-09-24 — Route handlers cannot be imported by Vitest (`h3` is not
  resolvable from the spec's TS program), so decisions moved into h3-free
  `project-service.ts`, matching `oidc.ts`/`devauth-admin.ts`.
- 2026-09-24 — Link verification requires a Cloud administrator (the only
  role that can read the account). Non-admins can create projects and unlink,
  and see links as unverifiable.
- 2026-09-24 — Migration verified on local D1 (wrangler/miniflare): legacy
  rows moved, columns dropped, FKs on; a duplicate claim aborts 0005 with no
  table created and the legacy columns intact.
