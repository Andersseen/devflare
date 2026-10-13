# 022 — Persistent dashboard customization (DevFlare + DevRadar)

| Field   | Value                                                      |
| ------- | ---------------------------------------------------------- |
| Status  | Done (verified locally; migrations to apply in production) |
| Branch  | `feature/dashboard-customization`                          |
| Created | 2026-10-13                                                 |
| Updated | 2026-10-13                                                 |

> Authorization note: the owner asked for direct implementation, so this spec
> was written and implemented in one pass without a separate approval stop.

## 1. Summary

Both dashboards become user-organizable and the layout is saved server-side
(D1, per user): an explicit **Edit dashboard** mode with groups, reordering
(Quartz pointer drag-and-drop **plus** keyboard/touch-safe buttons), hide /
restore, save / cancel / reset. DevRadar additionally gets **followed
repositories** (only followed ones feed every aggregate), DevFlare gets
**editable discovery identities** (the former hardcoded `WATCHED_PROJECTS`) and
an **Assign to project** action on discovered cards.

## 2. Problem / Motivation

DevFlare's grouping needed source edits (`WATCHED_PROJECTS`); DevRadar showed
all 88 installed repositories with totals over all of them. Neither could be
arranged.

## 3. Goals & Non-goals

- **Goals**: P0 follow/unfollow + selected-only filtering + persistence +
  hide/order + edit mode; P1 groups, Quartz DnD, resource assignment UI,
  `WATCHED_PROJECTS` migration to editable persisted config.
- **Non-goals**: widgets, chart builders, notification rules, collaboration,
  changing GitHub App permissions or sync, any Cloudflare write from dragging a
  card, shared layouts between users, AI automation.

## 4. Design

### Three concepts, kept apart (DevFlare)

| Concept            | Stored where                             | Meaning                                                                |
| ------------------ | ---------------------------------------- | ---------------------------------------------------------------------- |
| Visual grouping    | `dashboard_group`, `dashboard_item`      | Presentation only: order, group, hidden.                               |
| Discovery matching | `discovery_identity` + code seed         | Which unowned Workers/Pages are _suggested_ together. Never ownership. |
| Explicit ownership | `project_resource` (spec 019, unchanged) | The only thing that says a resource belongs to a project.              |

Moving or hiding a card writes only the first. Assigning a discovered resource
uses the existing verified `POST /projects/:id/resources`.

### Shared library `@org/dashboard-layout` (`libs/shared/dashboard-layout`, `domain:shared`)

- `logic.ts` (no Angular; also imported by both Workers): pure immutable ops on
  `DashboardLayout { groups[{id,name,itemIds}], ungroupedIds, hiddenIds, pinnedIds }`
  — `moveItem`, `nudgeItem`, `hideItem`, `showItem`, `togglePin`, group
  add/rename/move/delete, `reconcileLayout`, `parseLayout` (validation),
  `dropIndexFromPoint`. Invalid operations return the layout unchanged.
- `LayoutEditor`: signal-based draft state (edit mode, dirty, save/cancel/reset,
  serialized saves).
- `DashboardBoard`: the Quartz-backed group/card editing surface. Products
  supply the card via a template; they own data mapping.

### Quartz

`@quartz-headless/core@0.6.0` (`qzDraggable`, `qzDropZone`; the scoped package,
Angular 21 peer). The legacy unscoped `quartz-headless` (layout splitter) is
untouched. Verified limits: native HTML DnD only (no keyboard, touch not
guaranteed); `qzDraggableHandle` tests `event.target`, which is the draggable
itself on `dragstart`, so the whole card is draggable in edit mode and the grip
is a visual cue; `qzDrop.index` assumes a 1-D list, so the drop index is
computed by `dropIndexFromPoint` (grid-aware) from the pointer instead.
Every edit also has Move up/down, Move to group, Hide buttons.

### DevRadar

- Migration `0001_dashboard_preferences.sql`: `dashboard_group(id,user_id,name,position)`,
  `followed_repository(user_id,repository_id,group_id→SET NULL,position,pinned)`.
  `repository_id` is GitHub's stable id and deliberately **not** a foreign key,
  so a repository that leaves and re-enters the installation keeps its
  preference. Nothing is auto-followed; a first-time user sees onboarding.
- API: `GET/PUT /api/v1/dashboard-layout` (full ordered replace, upsert-then-
  prune so every intermediate state is valid), `GET /api/v1/repositories?scope=available`
  (all installed, each with `followed`). Existing list/overview/PR/activity
  endpoints read only followed repositories. `GET /repositories/:id` still works
  for any synced repository. Settings keeps the installed total, labeled.
- UI: Overview/Repositories sections by group + Edit dashboard + Manage
  repositories (search, multi-select, select all shown).

### DevFlare

- Migration `0006_dashboard_customization.sql`: `dashboard_group`,
  `dashboard_item(userId,itemKey,groupId,position,hidden,pinned)`,
  `discovery_identity(userId,slug,name,aliases,removed)`.
  Item keys: `saved:<projectId>`, `discovered:<slug>` (discovered cards can be
  hidden/restored only; they stay in their own section).
- API: `GET/PUT/DELETE /api/v1/dashboard` (layout, DELETE = restore default),
  `GET/PUT/DELETE /api/v1/dashboard/identities`.
- Effective identities = code seed (`WATCHED_PROJECTS`, kept as bootstrap, with
  its verified domains) overridden by persisted rows. Verified domains are only
  ever seeded; user-entered domains are not offered, so nothing arbitrary is
  labeled verified.
- UI: Edit dashboard on Projects; Assign to project on discovered cards; an
  identities manager (aliases) in edit mode.

## 5. Constraints

CONVENTIONS.md rules; apps never import each other; each app owns its D1; no
localStorage as a source of truth; server validates and scopes by user.

## 6. Test plan

Vitest: layout logic (lib), DevRadar store (follow persistence, isolation,
filtering, renames, empty), DevFlare store + identity merge + existing grouping
regression. Playwright: devflare/dev-radar edit, reorder (buttons + drag), move,
hide/restore, save/refresh, follow filtering.

## 7. Tasks

- [x] 1. Spec
- [x] 2. `@org/dashboard-layout` logic + specs
- [x] 3. Board component + editor
- [x] 4. DevRadar migration/store/API/UI/tests
- [x] 5. DevFlare migration/store/API/UI/tests
- [x] 6. E2E, docs, gates, PR

## 8. Verification results

- `pnpm format:check`, `nx run-many -t lint`, `typecheck`, `test --coverage`,
  `build` (all projects): green. New unit tests: 31 (layout lib), 8 + store
  changes (DevRadar `dashboard.spec.ts`), 11 (DevFlare `dashboard-store.spec.ts`
  and identities).
- Playwright on Chromium, Firefox and WebKit: `dev-radar-e2e` 114/114 (incl.
  pointer drag-and-drop between groups), `devflare-e2e` 63/63, `devtools-e2e`
  114 passed / 6 skipped. One cold-start flake each in the first full runs;
  re-runs clean.
- Local migrations applied (`pnpm db:migrate:local`); `pnpm install
--frozen-lockfile` accepts the lockfile.
- Not verified: real touch devices, production D1, a real many-repository
  GitHub App installation.

## 9. Completion notes

- Quartz 0.6.0 findings that shaped the design are in section 4. The drag
  handle is visual; the whole card is the drag source.
- DevRadar's "hide" is _unfollow_ (row deleted), so the shared layout's
  `hiddenIds` is a session-only tray there and must be empty on save.
- DevRadar saves use a new `PREFERENCES_RATE_LIMITER` (60/min) so layout saves
  do not share the 10/min manual-sync bucket.
- Limitations: concurrent saves from two tabs are last-writer-wins; discovered
  cards can be hidden but not grouped or reordered; user-entered domains are
  deliberately not offered (nothing user-typed is "verified"); a layout is not
  shared between users.
- Deferred: grouping/ordering of discovered cards, per-group collapse, and a
  keyboard drag mode (waiting on a Quartz primitive).
