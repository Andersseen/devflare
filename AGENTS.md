# DevFlare — AI Agent Guide

This is the entry point for AI coding agents. Read this first, then load only the docs you need:

| Doc                                                | Read when…                                              |
| -------------------------------------------------- | ------------------------------------------------------- |
| [docs/ai/CONTEXT.md](docs/ai/CONTEXT.md)           | You need to understand what this project is and why.    |
| [docs/ai/ARCHITECTURE.md](docs/ai/ARCHITECTURE.md) | You touch anything beyond a single component.           |
| [docs/ai/CONVENTIONS.md](docs/ai/CONVENTIONS.md)   | ALWAYS before writing or editing code.                  |
| [docs/ai/STATE.md](docs/ai/STATE.md)               | At session start — current status and in-progress work. |
| [docs/ai/WORKFLOWS.md](docs/ai/WORKFLOWS.md)       | You need to run, test, verify, or deploy.               |
| [docs/specs/README.md](docs/specs/README.md)       | You implement a new feature (Spec-Driven Development).  |

## What this is (one paragraph)

DevFlare is a developer-tools web platform: an AnalogJS (Angular 21) app with ~10
browser-based utilities (QR codes, image compression, palette extraction, …) plus
projects/deployments management, plus `dev-auth`: a standalone OAuth 2.1 / OIDC
**identity provider** (Hono + better-auth + Cloudflare D1/Workers) that DevFlare
and other apps in other repositories all authenticate against. Nx 22 monorepo, pnpm.

## Hard rules

1. **Never edit generated files**: `apps/dev-auth/src/pages/*.flow.js` are compiled
   from the sibling `.flow` files. Edit the `.flow` file, then run `pnpm --filter
@devflare/dev-auth build:flow` (pure npm — `@flowview/compiler`; no Rust binary).
2. **Standalone Angular only** — no NgModules. Pages use `export default class`.
3. **Signals over RxJS** for component state. `inject()` over constructor injection.
4. **Business logic lives in `libs/shared/core`** (`@org/core`) services; page
   components stay thin (UI + wiring).
5. **Server routes**: h3 `defineEventHandler`, auth via `getAppSession` +
   `requireAuth` (`apps/devflare/src/server/lib/session.ts`), SQL via `db.sql`
   tagged templates (never string concatenation).
6. **Do not commit secrets**. Local secrets: `.env` (root) and
   `apps/*/.dev.vars` — now gitignored, but `apps/dev-auth/.dev.vars` was
   committed before that and is still tracked; untrack it rather than adding to it.
7. **Before declaring done**: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`
   (or `pnpm check` to also build). Fix what you broke, not unrelated failures.
8. **Update [docs/ai/STATE.md](docs/ai/STATE.md)** when you finish meaningful work
   (see the "How to update" section inside it).
9. **dev-auth serves more than DevFlare.** Register a consumer app in
   `OAUTH_CLIENTS`; never add a DevFlare-specific assumption to the provider.

## Quick reference

- Package manager: **pnpm** (never npm/yarn). Node ≥ 22.
- Run everything: `pnpm dev:all` → app on :4200, auth on :8787.
- Test user: `test@devflare.com` / `TestPass123` (create with `pnpm seed:user`).
- TS path aliases: `@org/core`, `@org/ui`, `@org/auth`, `@org/deploy` (see `tsconfig.base.json`).
- Main app routes: `apps/devflare/src/app/pages/**/*.page.ts` (AnalogJS file-based).
- Main app API: `apps/devflare/src/server/routes/api/**` (Nitro/h3 file-based).
- Auth service: `apps/dev-auth/src/index.ts` (Hono on Cloudflare Workers).
- Branch workflow: `feature/*` branches → PR to `main`. Commit style: `feat: …`, `fix: …`.
