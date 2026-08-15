# 006 — Deploy for real: direct upload to Cloudflare Pages

| Field   | Value                             |
| ------- | --------------------------------- |
| Status  | In progress                       |
| Branch  | `feature/006-pages-direct-upload` |
| Created | 2026-08-15                        |
| Updated | 2026-08-15                        |

## 1. Summary

`/deploy` stops pretending. Drop a built folder onto it, pick one of your real
Cloudflare Pages projects, and DevFlare uploads it through the Pages direct
upload API and records the result in the `deployments` table — which, since the
schema was written, no code has ever read or written.

## 2. Problem / Motivation

Spec 005 made the Cloud section tell the truth about the account but explicitly
left `deploy.page.ts` alone ("a real build pipeline is a separate spec"). What
is left is the last piece of theatre in the platform, and it is the central one:

- [`deploy.page.ts:237`](../../apps/devflare/src/app/pages/deploy.page.ts#L237)
  mounts `getMockFiles()` and fakes both build and upload with `setTimeout`.
- `libs/deploy/` is an Nx library with **no source files at all** — only
  `project.json` and `tsconfig.json`, and `targets: {}`.
- The `deployments` table from `0000_init.sql` has **zero** readers and writers
  in the repo. Verified by grep, not assumed.
- No COOP/COEP headers exist anywhere in the repo, so `crossOriginIsolated` is
  `false` in production and WebContainers cannot boot regardless. The page is
  dead twice over, for two independent reasons.

Spec 005 also established the fact that makes this cheap: **every Pages project
on this account is `ad_hoc`** — a direct upload. Cloudflare has no source to
build from, so the useful thing DevFlare can do is _be_ the uploader. No GitHub
App, no in-browser git clone, no WebContainer, no cross-origin isolation.

## 3. Goals & Non-goals

**Goals**

- Choose an already-built output folder in the browser (picker or drag & drop)
  and deploy it to a chosen Pages project.
- The `CLOUDFLARE_API_TOKEN` never reaches the browser — same posture as 005.
- Only changed assets are uploaded (`check-missing`), so a re-deploy of a mostly
  unchanged site transfers almost nothing.
- `_headers` and `_redirects` are honoured — an Angular SPA needs the latter.
- Every successful deploy writes a `deployments` row, and a project's history is
  readable from `/projects` and from the Pages detail page.
- Client-side refusal, with a legible message, of anything Pages will reject:
  > 20,000 files or any file >25 MiB.
- `libs/deploy` becomes a real library holding the client engine, so
  `deploy.page.ts` is UI and wiring only.

**Non-goals**

- **Building anything.** The user brings a built folder. No WebContainer, no
  npm install, no compile step, in the browser or anywhere else.
- Pages Functions: `_worker.js`, `functions/`, `_routes.json`. Those need esbuild
  bundling server-side. Ignored on upload, exactly as `wrangler` ignores them
  when they are not being bundled.
- Deploying to Workers. Pages only.
- Git-connected projects. The existing rebuild button (005) already covers them.
- Preview/branch deployments beyond naming the branch on the form.

## 4. Design

### The upload protocol (read out of `wrangler`'s own source, not from memory)

`node_modules/wrangler/wrangler-dist/cli.js`, `src/pages/hash.ts` and
`src/pages/upload.ts`:

1. `GET /accounts/{id}/pages/projects/{name}/upload-token` → `{ jwt }`.
   Account token. The JWT is scoped to asset upload for that one project.
2. `POST /pages/assets/check-missing`, `{ hashes: string[] }`, `Bearer <jwt>` →
   the subset that must actually be uploaded. **Not account-scoped** — the path
   has no `/accounts/{id}` prefix.
3. `POST /pages/assets/upload`, `Bearer <jwt>`, body is an array of
   `{ key: hash, value: base64, metadata: { contentType }, base64: true }`.
4. `POST /accounts/{id}/pages/projects/{name}/deployments` with the account
   token and **`multipart/form-data`**: `manifest` (JSON, `"/path" → hash`),
   plus optional `branch`, `commit_message`, `commit_hash`, and `_headers` /
   `_redirects` as `File` parts.

The hash is the load-bearing detail:

```ts
blake3(base64(fileBytes) + extensionWithoutDot)
  .hex()
  .slice(0, 32);
```

BLAKE3 — not SHA-256, so WebCrypto cannot do it — over the **base64 string**
concatenated with the extension, first 32 hex chars. Getting this wrong makes
`check-missing` report every file missing forever, which still _works_, just
uploads everything every time. It is worth a unit test with a known vector.

Wrangler's own limits, mirrored: `MAX_ASSET_COUNT 20000`, `MAX_ASSET_SIZE
25 MiB`, `MAX_BUCKET_SIZE 40 MB`, `MAX_BUCKET_FILE_COUNT 2000`.

### Where each step runs, and why

Hashing and base64 happen **in the browser**; the Worker only forwards JSON. A
Cloudflare Worker's limit is CPU time, not wall time, and `fetch` waiting costs
nothing — but base64-encoding and BLAKE3-hashing 25 MiB would blow the free
plan's 10 ms CPU budget instantly. Proxying bytes is cheap; computing over them
is not.

The browser never gets the JWT either. Handing it over would be defensible (it
is narrowly scoped, and wrangler accepts one via `CF_PAGES_UPLOAD_JWT`), but it
would mean the browser calling `api.cloudflare.com` directly, and whether that
origin serves CORS for `/pages/assets/*` is unverified. Proxying keeps 005's
posture — the browser talks same-origin to DevFlare and nothing else — at the
cost of the bytes passing through the Worker once.

Buckets are capped at **15 MB of raw bytes** rather than wrangler's 40 MB:
base64 inflates by ~33%, and the Worker request body limit is 100 MB. 15 MB in
→ ~20 MB of JSON is comfortably clear of it and keeps each POST short. One
bucket per Worker invocation means ~2 subrequests each, well under the free
plan's 50.

### User flow

1. `/deploy` lists the account's Pages projects (reusing `/api/v1/cloud/pages`).
   With no token configured, the same "connect your account" state 005 uses.
2. Pick a project; optionally pick a linked DevFlare project and a branch
   (defaults to the project's `production_branch`).
3. Drop a folder, or pick one with `<input type="file" webkitdirectory>`. The
   first path segment is the chosen folder's own name and is stripped, so
   `dist/browser/index.html` deploys as `/index.html`.
4. A real progress list, replacing the fake one: **Read** _n_ files → **Hash** →
   **Compare** (_m_ of _n_ need uploading) → **Upload** (per-bucket progress) →
   **Publish**. Errors stop the run and say which file or step failed.
5. On success: the live URL, the deployment short id, and the `deployments` row.

### Files

| File                                                          | Change                                                                                                                                    |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `libs/deploy/src/index.ts`                                    | new — public surface of `@org/deploy` (alias already in `tsconfig.base.json`)                                                             |
| `libs/deploy/src/lib/asset-hash.ts`                           | new — the BLAKE3 hash above                                                                                                               |
| `libs/deploy/src/lib/collect-assets.ts`                       | new — `FileList` → assets; strips the root segment, applies the ignore list, extracts `_headers`/`_redirects`, enforces count/size limits |
| `libs/deploy/src/lib/bucket.ts`                               | new — pack assets into ≤15 MB / ≤2000-file buckets                                                                                        |
| `libs/deploy/src/lib/deploy-client.ts`                        | new — the orchestration, exposed as signals (`phase`, `progress`, `log`, `error`)                                                         |
| `libs/deploy/src/lib/*.spec.ts`                               | new — unit tests for all four                                                                                                             |
| `libs/deploy/project.json`                                    | `targets: {}` → real `lint` + `test` targets (`@org/core` needed the same in 005)                                                         |
| `apps/devflare/src/server/lib/pages-upload.ts`                | new — the four calls above; a non-account-scoped fetch and a `FormData` POST, neither of which `cfFetch` can express                      |
| `apps/devflare/src/server/lib/pages-upload.spec.ts`           | new                                                                                                                                       |
| `.../routes/api/v1/cloud/pages/[name]/upload/check.post.ts`   | new — `{ hashes }` → `{ missing }`                                                                                                        |
| `.../routes/api/v1/cloud/pages/[name]/upload/assets.post.ts`  | new — one bucket, forwarded verbatim                                                                                                      |
| `.../routes/api/v1/cloud/pages/[name]/upload/publish.post.ts` | new — manifest → deployment, and the `deployments` row                                                                                    |
| `apps/devflare/src/app/pages/deploy.page.ts`                  | rewritten — UI only, driven by `@org/deploy`                                                                                              |
| `apps/devflare/src/app/pages/projects.page.ts`                | show a linked project's deployment history                                                                                                |
| `libs/shared/core/src/lib/services/webcontainer.service.ts`   | **deleted**, with its export in `index.ts`                                                                                                |
| `package.json`                                                | `-@webcontainer/api`, `+@noble/hashes`                                                                                                    |

All three upload routes go through the existing `withCloudflare` /
`requireCloudAdmin` wrapper, like every other `/api/v1/cloud/*` route.

### Decisions & trade-offs

- **`@noble/hashes/blake3`** (2.3.0 exports it) over `blake3-wasm`, which is
  what wrangler uses. Pure JS, audited, tree-shakeable, and no wasm to fetch —
  which matters because a wasm load has to survive both SSR and the CSP.
- **No DB migration.** `deployments` as written in `0000_init.sql` already fits:
  `id` holds the Cloudflare deployment id, `previewUrl` its URL, `status` the
  latest stage's status, `commitSha` stays null because a direct upload has no
  commit. The table finally does the job it was designed for.
- **The upload JWT is memoised** in module scope per project with a
  conservative TTL, next to the existing response cache in `cloudflare.ts` —
  otherwise every bucket costs an extra round trip.
- **`libs/deploy`, not `libs/shared/core`.** CONVENTIONS.md says logic lives in
  `@org/core`, but `@org/deploy` exists as an alias, points at an empty library,
  and this is exactly the feature it was created for. Noted here so the
  divergence is deliberate rather than drift.

## 5. Constraints

- Standalone components, signals, `inject()`; `deploy.page.ts` stays a thin page
  (CONVENTIONS.md).
- `db.sql` returns `{ rows, success }` — the `publish` route must go through
  `server/lib/project-rows.ts`, not index the result.
- A `server/lib/<x>.ts` may not share a name with a `server/routes/**/<x>/`
  directory (the trap that produced `project-rows.ts`). `pages-upload.ts` is
  safe: the route directory is `upload/`, the lib is `pages-upload`.
- `src/server/routes` is excluded from `tsconfig.app.json`, so `pnpm typecheck`
  never sees the three new routes. Their logic must live in the lib, which is
  typechecked and tested.
- One new runtime dependency (`@noble/hashes`), one removed
  (`@webcontainer/api`, ~heavy). Net bundle win.
- Client-side first (CONTEXT.md): reading, hashing and encoding all happen in
  the browser; the server is a credential holder and a proxy.

## 6. Test plan

**Unit** — `pnpm test`:

- `asset-hash.spec.ts` — a known vector: hashing a fixed byte string with a
  fixed extension yields exactly the 32 hex chars wrangler would produce.
- `collect-assets.spec.ts` — root segment stripped; `.DS_Store`, `node_modules`,
  `.git`, `_worker.js`, `functions/` excluded; `_headers`/`_redirects` pulled
  aside rather than uploaded as assets; >25 MiB and >20,000 files both rejected
  with the file named.
- `bucket.spec.ts` — never exceeds either cap; a single oversized-but-legal file
  gets its own bucket; empty input yields no buckets.
- `deploy-client.spec.ts` — against a stubbed transport: only missing hashes are
  uploaded; a failed bucket surfaces and halts; phases advance in order.
- `pages-upload.spec.ts` — `check-missing` hits the un-prefixed path; publish
  sends `multipart/form-data` with the manifest; a Cloudflare error is forwarded
  with its status, not flattened to 500.

**Manual** — `pnpm dev:all`, signed in as an administrator, with
`CLOUDFLARE_API_TOKEN` in `apps/devflare/.dev.vars`:

1. `nx build devflare` to get a real `dist/`.
2. `/deploy` → pick a scratch Pages project → drop that `dist/` → watch it
   through all five phases → open the returned URL and confirm it serves.
3. Deploy the identical folder again: **Compare** must report 0 of _n_ missing
   and the run must finish in seconds. That is the proof the hash is right.
4. Change one file, redeploy: exactly 1 file uploads.
5. `wrangler d1 execute devflare-db --local --command "SELECT * FROM
deployments"` → the rows are there.
6. Confirm the deployment appears in `/cloud/pages/<name>` history alongside
   ones made by `wrangler`, with trigger `ad_hoc`.
7. Unset the token → `/deploy` shows the connect prompt, not an error.

A scratch Pages project is used throughout. Nothing deploys over a live site
during verification.

## 7. Tasks

- [ ] 1. `libs/deploy`: real Nx targets, `asset-hash.ts` + spec (the hash first —
     everything else is worthless if it is wrong)
- [ ] 2. `collect-assets.ts` + `bucket.ts` + specs
- [ ] 3. `server/lib/pages-upload.ts` + spec (JWT memo, the two non-`cfFetch`
     request shapes)
- [ ] 4. The three `upload/*` routes, admin-gated
- [ ] 5. `deploy-client.ts` + spec — orchestration over a transport interface
- [ ] 6. Rewrite `deploy.page.ts`; delete `webcontainer.service.ts` and drop
     `@webcontainer/api`
- [ ] 7. `deployments` row on publish; history on `projects.page.ts`
- [ ] 8. Quality gates (`pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`)
- [ ] 9. Manual verification (section 6), including the re-deploy-is-a-no-op check
- [ ] 10. Update `docs/ai/STATE.md` + the index in `docs/specs/README.md`

## 8. Verification results

_Filled during implementation._

## 9. Log / Deviations

- **2026-08-15** — Direction chosen by the owner over three alternatives
  (transactional email for dev-auth, Cloud GraphQL analytics, tech-debt pass).
- **2026-08-15** — Protocol and every constant taken from `wrangler`'s bundled
  source in `node_modules`, not from documentation or memory. The BLAKE3-over-
  base64-plus-extension hash is the one detail no amount of reading the public
  API reference would have given.
