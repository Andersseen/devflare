# 008 — Browse what is inside an R2 bucket

| Field   | Value                                      |
| ------- | ------------------------------------------ |
| Status  | In progress                                |
| Branch  | `feature/007-oauth-scopes-and-client-id`\* |
| Created | 2026-08-17                                 |
| Updated | 2026-08-17                                 |

\* Rides along on the branch that is already open and unpushed, rather than
opening a second one — the owner asks for related work to arrive as one push.

## 1. Summary

Buckets leave the Storage page and get their own sidebar entry, and a bucket
opens into a browser: breadcrumb plus a list of folders and objects, one level
at a time.

## 2. Problem / Motivation

The Cloud section can name every bucket on the account and say nothing about
what is in one. That is where the question actually starts — a bucket is a
container, and "you have 7 buckets" answers nothing an owner wants to know.

Storage also lumps three unrelated products into one page. D1 and KV are lists
of things you look at from the outside; a bucket has an inside. Putting the one
navigable resource behind the same flat list is what made it feel finished when
it was not.

## 3. Goals & Non-goals

**Goals**

- `/cloud/buckets` lists the buckets; a `Buckets` entry sits in the sidebar.
- `/cloud/buckets/<name>` browses that bucket: folders first, then objects with
  size and date, with a breadcrumb back to any ancestor.
- Navigation lives in the URL (`?prefix=`), so back/forward and sharing a link
  work without any extra code.
- Truncated listings can be continued ("Load more").
- Storage keeps D1 and KV, and stops reporting R2.

**Non-goals**

- Downloading or previewing an object. That needs a signed URL or a proxy
  through the Worker, and is a separate decision.
- Uploading, deleting or renaming. This section is read-only, like the rest of
  Cloud.
- A tree component. See the design note below — there is nothing to build.

## 4. Design

### Why a list and not a tree

Cloudflare's object listing takes `prefix` and `delimiter` and answers one level
at a time: files land in `result`, and the "folders" at that level land in
`result_info.delimited`. Verified against the `devflare` bucket:

```
?delimiter=/                    → result: []            delimited: [deploybolt/, dist/, output/]
?prefix=deploybolt/&delimiter=/ → result: [index.html]  delimited: [deploybolt/assets/]
```

A tree would mean fetching every key in the bucket and rebuilding that hierarchy
client-side, holding it all in memory, for a view that only ever shows one level.
The API already did the work. Neither `ng-primitives` (49 primitives) nor Volt
UI (40 components) ships a tree anyway, so this also avoids writing one.

Pagination is a `cursor` in `result_info` alongside `is_truncated`.

### Files

| File                                                                     | Change                                |
| ------------------------------------------------------------------------ | ------------------------------------- |
| `apps/devflare/src/server/lib/cloudflare.ts`                             | `cfRequestEnvelope` + `listR2Objects` |
| `apps/devflare/src/server/routes/api/v1/cloud/buckets/index.ts`          | new — the bucket list                 |
| `apps/devflare/src/server/routes/api/v1/cloud/buckets/[name]/objects.ts` | new — one level of one bucket         |
| `apps/devflare/src/server/routes/api/v1/cloud/storage.ts`                | stops reporting R2                    |
| `libs/shared/core/src/lib/services/cloudflare-account.service.ts`        | object/folder types + two loaders     |
| `apps/devflare/src/app/pages/cloud/buckets.page.ts`                      | new — the list                        |
| `apps/devflare/src/app/pages/cloud/buckets/[name].page.ts`               | new — the browser                     |
| `apps/devflare/src/app/pages/cloud/storage.page.ts`                      | drops the R2 card                     |
| `apps/devflare/src/app/components/shell-navigation.ts`                   | `Buckets` in the Cloudflare group     |
| `apps/devflare/src/app/app.routes.ts`                                    | both routes (routing is manual here)  |

### API

`GET /api/v1/cloud/buckets` → `{ items: [{ name, createdAt, location }] }`

`GET /api/v1/cloud/buckets/<name>/objects?prefix=&cursor=` →

```jsonc
{
  "prefix": "deploybolt/",
  "folders": [{ "prefix": "deploybolt/assets/", "name": "assets" }],
  "objects": [{ "key": "…", "name": "index.html", "size": 512, "lastModified": "…", "storageClass": "Standard" }],
  "cursor": null, // present when the listing is truncated
}
```

Admin-gated through `withCloudflare`, like every other Cloud route. `name` is
percent-encoded into the upstream path and never concatenated raw.

### Decisions & trade-offs

- **Object listings are not memoized.** `cfFetch`'s 60s memo is keyed on the
  path, and a listing keyed by prefix _and_ cursor has almost no hit rate while
  filling the map with entries nobody reads twice. It also discards
  `result_info`, which is exactly the half this feature needs.
- **`prefix` is a query parameter, not a route segment.** A key can contain
  anything, including slashes and characters that would need escaping in a path.
  One `?prefix=` also keeps every level a single route.
- **Folders are a display fiction, honestly labelled.** R2 has no directories;
  `delimited` is a grouping the API computes. The UI shows them as folders
  because that is what the keys mean, and never claims one can be created.

## 5. Constraints

`docs/ai/CONVENTIONS.md`: standalone components, signals, `inject()`, thin pages
over `@org/core`, `db.sql` untouched (nothing here is stored), new routes under
`server/routes/api/v1/…`. Routing is the manual table in `app.routes.ts` — a
page not registered there is invisible. No new dependencies.

## 6. Test plan

- Unit (`cloudflare.spec.ts`): `listR2Objects` builds the upstream URL with
  `delimiter=/`, encodes the bucket name, passes `prefix`/`cursor` only when set,
  and maps `result` + `result_info.delimited` into objects and folders; a
  truncated response surfaces its cursor.
- Manual: `/cloud/buckets` lists 7 buckets; opening `devflare` shows
  `deploybolt/`, `dist/`, `output/` and no files; entering `deploybolt/` shows
  `index.html` plus `assets/`; the breadcrumb returns to the root; browser back
  retraces the path.

## 7. Tasks

- [x] 1. `cfRequestEnvelope` + `listR2Objects` + spec.
- [x] 2. Bucket routes; R2 out of the storage route.
- [x] 3. `@org/core` types and loaders.
- [x] 4. Buckets list page + sidebar entry + routes.
- [x] 5. Bucket browser page.
- [x] 6. Storage page drops R2.
- [x] 7. Quality gates.
- [ ] 8. Manual verification (section 6) — needs a browser session.
- [x] 9. `docs/ai/STATE.md` + the index in `docs/specs/README.md`.

## 8. Verification results

2026-08-17: `vitest` 8 files / **107 tests** (6 new for `listR2Objects`),
`tsc --noEmit`, `eslint` and `prettier` all clean, and `nx build devflare`
succeeds — which is the one that checks the templates, since
`tsconfig.app.json` excludes `src/server/routes` and plain `tsc` never looks at
Angular templates at all.

Both routes are registered in the built manifest: `/api/v1/cloud/buckets` and
`/api/v1/cloud/buckets/:name/objects`.

The upstream behaviour every mapping depends on was read from the real account
before the code was written (see section 4), so the only thing left is whether
the pages look right, which needs a signed-in browser.

## 9. Log / Deviations

- **2026-08-17** — Endpoint, `prefix`/`delimiter` behaviour and the cursor shape
  were probed against the real account before any of this was written, so the
  design follows what the API does rather than what S3 does. Object listing
  needs no S3 credentials: the account bearer token is enough, contrary to the
  caution raised when this was first proposed.
