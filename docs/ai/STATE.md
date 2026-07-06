# STATE — Current status snapshot

> **Load this at the start of every session.** It is the hand-off note between
> work sessions and between agents.
>
> **How to update (mandatory when you finish meaningful work):** rewrite the
> sections below to reflect reality — don't append forever. Keep "Session log"
> to the last ~5 entries, newest first. Update the date. Facts only; no plans
> you didn't verify.

_Last updated: 2026-07-06_

## Branch & repo status

- On `main`. **Uncommitted work in progress** (see next section).
- Recent merged work: PR #4 app updates, PR #3 dev-auth updates, CI workflows,
  Sentry integration (`@sentry/angular`, `@sentry/cloudflare`).

## Work in progress: Flowmark migration of dev-auth pages

The big uncommitted change: dev-auth's auth pages were migrated from inline
HTML-in-TypeScript strings (~800 lines deleted) to **Flowmark `.flow` templates**:

- New: `src/pages/*.flow` (6 pages), `scripts/compile-flow.mjs`,
  `scripts/watch-flow.mjs`, `src/types/flowmark.d.ts`, `@flowview/runtime` dep.
- Modified: `pages/*.ts` are now thin wrappers calling the compiled
  `render()` from `*.flow.js`; `wrangler.toml` gained a `[build] command`.
- **Known limitation ("until Phase 4" of the flowmark project)**: compiling
  requires the `flowmark` Rust binary on the machine
  (`cargo install --path crates/flowmark-cli` from the author's flowmark repo).
  CI/other machines without it cannot build dev-auth. This is the main open risk
  of the migration.
- Status: compiles locally (`.flow.js` files exist). Not yet committed.

## What works today

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

1. Commit the Flowmark migration once the binary-dependency story is acceptable.
2. Remove the local `flowmark` binary requirement (flowmark "Phase 4").
3. Wire real Cloudflare staging/production IDs + secrets for deploy workflows.

## Session log

- **2026-07-06** — Added AI agent documentation set: root `AGENTS.md`/`CLAUDE.md`,
  `docs/ai/` (context, architecture, conventions, state, workflows),
  `docs/specs/` (SDD process + template). No app code touched.
