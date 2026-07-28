# STATE — Current status snapshot

> **Load this at the start of every session.** It is the hand-off note between
> work sessions and between agents.
>
> **How to update (mandatory when you finish meaningful work):** rewrite the
> sections below to reflect reality — don't append forever. Keep "Session log"
> to the last ~5 entries, newest first. Update the date. Facts only; no plans
> you didn't verify.

_Last updated: 2026-07-28_

## Branch & repo status

- On `main`, in sync with `origin/main` (`9988d59`).
- **Uncommitted:** the app-shell rework ("UI shell") and the Cloudflare
  migration ("Hosting") below.
- Recent merged work: Flowmark migration of dev-auth pages (`2138796`), PR #4 app
  updates, PR #3 dev-auth updates, CI workflows, Sentry integration.

## Hosting: Vercel → Cloudflare (uncommitted, NOT yet deployed)

The app moved from a Vercel-dashboard Git deploy to a Cloudflare Worker. Nothing
of DevFlare had ever existed on Cloudflare before this — the old production
`deploy.yml` would have failed, because `dev-auth-db` was never created and its
frontend job only uploaded a build artifact.

**Provisioned 2026-07-28** (account `c32a93ee83fe9b5d53c63fcc73b90bb9`):

| Resource | Name                          | ID                                     |
| -------- | ----------------------------- | -------------------------------------- |
| D1       | `devflare-db`                 | `399d5c02-d2b0-4537-9899-b28771b2c645` |
| D1       | `dev-auth-db-prod`            | `6028a3b7-c545-46fb-aba2-b8b444d2dce0` |
| D1       | `dev-auth-db-staging`         | `fccd953b-0780-40d5-80b1-e9444c01cfe7` |
| KV       | `dev-auth-rate-limit-prod`    | `2a96a69362c9460fbf1dc6715ab0ed38`     |
| KV       | `dev-auth-rate-limit-staging` | `38f688fba9d1466ea801902f36dbe2d2`     |

Migrations are already applied to all three D1 databases (remote).

Target domains: app `devflare.andersseen.dev`, auth
`auth-devflare.andersseen.dev` (shared parent domain, so the session cookie is
same-site).

Key decisions and the traps behind them:

- Nitro preset `cloudflare-module`. **`compatibilityDate` in
  `apps/devflare/vite.config.ts` is load-bearing:** Nitro filters dev presets by
  it, `cloudflare-dev` requires ≥ 2025-07-15, and Analog hardcodes 2024-11-19.
  Lower it and local dev silently loses all bindings — every D1 query fails with
  "binding `DB` not found" while the build still passes.
- **Not** using `cloudflare.deployConfig`. It makes Nitro emit a merged config
  plus a `.wrangler/deploy/config.json` redirect, and wrangler refuses
  redirected configs that declare environments. `apps/devflare/wrangler.toml`
  therefore owns `main` and `[assets]` itself.
- App DB is D1 via db0's `cloudflare-d1` connector. The binding resolves lazily
  from `globalThis.__env__`, which Nitro sets both in production and (via
  `getPlatformProxy`) in dev — so one code path covers both and the route
  handlers needed no changes. `initDatabase()` DDL-at-import is gone; schema is
  in `apps/devflare/src/server/db/migrations/`.
- `auth-remote.ts` reads `DEV_AUTH_URL` from the Cloudflare binding first and
  only falls back to `process.env`, rather than trusting the unenv shim.
- Browser-only tool deps cannot enter the Worker bundle. `colorthief` is aliased
  to its ESM build (the Node build reaches `sharp`); `papaparse` has no usable
  build (CJS + Blob-worker breaks Rollup's CJS transform) so it is aliased to
  `apps/devflare/shims/papaparse.server.mjs`, which throws if SSR ever calls it.
- `better-sqlite3` and the tracked, empty `data/devflare.db` are removed.

## UI shell (uncommitted)

Reworked the shell so the VoltUI adoption keeps the pre-VoltUI look:

- **Root cause of the visual regression:** `apps/devflare/src/styles.css` never
  imported `@voltui/components/themes.css`. That file carries the
  `@source '../fesm2022'` directive Tailwind v4 needs to scan the compiled
  component bundle — without it Tailwind skips `node_modules` and purges every
  utility used _inside_ Volt templates. `md:relative`, `w-72`, `bg-surface` and
  `text-foreground` were all absent from the built CSS, so the sidebar stayed
  `position: fixed` with no width and overlapped the main content.
- The import also supplies tokens the app never defined
  (`--surface-foreground`, `--scrollbar-thumb`, `--color-foreground`). The app's
  own slate/indigo palette is declared after it and still wins.
- Volt keys `dark:` off a `.dark` class; this app is driven by
  `prefers-color-scheme`. `styles.css` redeclares the `dark` variant to accept
  both so the existing `dark:` utilities keep working.
- New `components/shell-navigation.ts` is the single source of truth for the
  navbar sections, sidebar groups and the tool catalog.
- New `components/navbar.component.ts` (logo, Deployment/DevTools tabs, auth
  actions); the sidebar now renders only the active section's groups instead of
  one flat 14-item list.
- New `/tools` route (`pages/tools/(tools).page.ts`) so the DevTools tab has a
  landing page; card grid extracted to `components/tool-grid.component.ts` and
  shared with the home page.

## Flowmark migration of dev-auth pages (merged in `2138796`)

dev-auth's auth pages were migrated from inline HTML-in-TypeScript strings
(~800 lines deleted) to **Flowmark `.flow` templates**:

- New: `src/pages/*.flow` (6 pages), `scripts/compile-flow.mjs`,
  `scripts/watch-flow.mjs`, `src/types/flowmark.d.ts`, `@flowview/runtime` dep.
- Modified: `pages/*.ts` are now thin wrappers calling the compiled
  `render()` from `*.flow.js`; `wrangler.toml` gained a `[build] command`.
- **Known limitation ("until Phase 4" of the flowmark project)**: compiling
  requires the `flowmark` Rust binary on the machine
  (`cargo install --path crates/flowmark-cli` from the author's flowmark repo).
  CI/other machines without it cannot build dev-auth. This is the main open risk
  of the migration.
- Status: compiles locally (`.flow.js` files exist).

## What works today

- App shell: navbar with Deployment/DevTools sections, section-scoped sidebar,
  `/tools` index. `pnpm check` is green.
- All 10 tool pages under `/tools/*` (client-side: QR, bg-remover, image
  compressor, data converter, OG generator, palette, screen recorder, SEO
  simulator, SVG optimizer, URL shortener).
- Full auth flow in local dev: `pnpm dev:all` → login at :4200 proxied to :8787,
  session cookies, `pnpm seed:user` test account (`test@devflare.com` / `TestPass123`).
- Projects API (`GET/POST /api/v1/projects`, `/api/v1/projects/[id]`), auth-gated,
  now backed by Cloudflare D1 — locally via miniflare state in `.wrangler/`.
  Verified end to end in dev (insert/select/delete against the `DB` binding).

## Known gaps / not production-ready

- **Nothing is deployed to Cloudflare yet.** Code, config and databases are
  ready and `wrangler deploy --dry-run` passes for the app, but no production
  deploy has run and Vercel is still serving the live site.
- **Secrets are not set.** `BETTER_AUTH_SECRET` (and `GITHUB_CLIENT_SECRET` if
  GitHub OAuth is wanted) must be set with `wrangler secret put --env production`
  before dev-auth will work deployed.
- The Analog app has **no staging environment** — staging covers dev-auth only.
  Adding it needs a `devflare-db-staging` D1 plus an `[env.staging]` block.
- Email verification sending (Resend) is documented in DEPLOY.md but not
  implemented in `auth.config.ts`.
- `deployments` table exists but the deploy feature (`libs/deploy`,
  `deploy.page.ts`) is skeletal.

## Next steps (owner's apparent intent — confirm before large work)

1. Set the Cloudflare secrets, then run the first production deploy of both
   workers and verify `devflare.andersseen.dev`.
2. Disconnect the Vercel project once Cloudflare serves traffic.
3. Review the shell rework in a browser, then commit it.
4. Remove the local `flowmark` binary requirement (flowmark "Phase 4").

## Session log

- **2026-07-28** — Migrated hosting from Vercel to Cloudflare: Nitro
  `cloudflare-module` preset, app DB on D1, provisioned 3 D1 + 2 KV and applied
  all migrations, rewrote both deploy workflows (fixing a pre-existing bug where
  they passed a database name that never resolved under `--env`). Not deployed
  yet; secrets pending.
- **2026-07-28** — Fixed the VoltUI visual regression: the missing
  `@voltui/components/themes.css` import meant Tailwind purged every class used
  inside Volt's templates. Added the import plus the missing theme tokens, then
  restructured the shell (navbar with Deployment/DevTools sections,
  section-scoped sidebar, shared tool grid, new `/tools` page).
- **2026-07-06** — Added AI agent documentation set: root `AGENTS.md`/`CLAUDE.md`,
  `docs/ai/` (context, architecture, conventions, state, workflows),
  `docs/specs/` (SDD process + template). No app code touched.
