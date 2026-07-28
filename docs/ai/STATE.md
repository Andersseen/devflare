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
- **Uncommitted:** the app-shell rework described under "UI shell" below.
- Recent merged work: Flowmark migration of dev-auth pages (`2138796`), PR #4 app
  updates, PR #3 dev-auth updates, CI workflows, Sentry integration.

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
  stored in local SQLite (`data/devflare.db`).

## Known gaps / not production-ready

- `wrangler.toml` staging/production D1 and KV IDs are **placeholders** — no real
  cloud environment is wired in this repo's config.
- Email verification sending (Resend) is documented in DEPLOY.md but not
  implemented in `auth.config.ts`.
- `deployments` table exists but the deploy feature (`libs/deploy`,
  `deploy.page.ts`) is skeletal.
- App DB has no migration system (schema lives in `initDatabase()`).

## Next steps (owner's apparent intent — confirm before large work)

1. Review the shell rework in a browser, then commit it.
2. Remove the local `flowmark` binary requirement (flowmark "Phase 4").
3. Wire real Cloudflare staging/production IDs + secrets for deploy workflows.

## Session log

- **2026-07-28** — Fixed the VoltUI visual regression: the missing
  `@voltui/components/themes.css` import meant Tailwind purged every class used
  inside Volt's templates. Added the import plus the missing theme tokens, then
  restructured the shell (navbar with Deployment/DevTools sections,
  section-scoped sidebar, shared tool grid, new `/tools` page).
- **2026-07-06** — Added AI agent documentation set: root `AGENTS.md`/`CLAUDE.md`,
  `docs/ai/` (context, architecture, conventions, state, workflows),
  `docs/specs/` (SDD process + template). No app code touched.
