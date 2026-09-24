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

The DevFlare repo is an Nx 22 / pnpm monorepo of four products: **DevFlare**
(`apps/devflare`, AnalogJS/Angular 21) — a personal **project hub** over the
owner's Cloudflare account; **DevTools** (`apps/devtools`) — anonymous,
**curated developer tools**, mostly local/in-browser (OAuth inspector, Wrangler
doctor, cURL⇄fetch, …) plus a few connected ones (short links, domain
inspector) behind DevAuth; **DevAuth**
(`apps/dev-auth`) — a standalone OAuth 2.1 / OIDC **identity provider** (Hono +
better-auth + D1) that DevFlare and apps in other repositories authenticate
against, plus its `@dev-auth/*` SDK; and **Cloudflare Connect**
(`apps/cloudflare-connect`) — a not-yet-implemented placeholder. "DevFlare"
alone means the hub app, not the repo.

## Hard rules

1. **Never edit generated files**: `apps/dev-auth/src/pages/*.flow.js` and
   `libs/shared/dev-auth-elements/src/lib/elements/*.flow.js` (+ their sibling
   `*.flow.d.ts`) are compiled from the sibling `.flow` files. Edit the `.flow`
   file, then run `pnpm --filter @devflare/dev-auth build:flow` or `npx nx run
dev-auth-elements:build:flow` respectively (pure npm — `@flowview/compiler`;
   no Rust binary).
2. **Standalone Angular only** — no NgModules. Pages use `export default class`.
3. **Signals over RxJS** for component state. `inject()` over constructor injection.
4. **Business logic lives in services**, not pages: DevFlare's in
   `libs/shared/core` (`@org/core`), DevTools' colocated in
   `apps/devtools/src/app/tools/`. Page components stay thin (UI + wiring).
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
10. **Keep the products apart.** Developer utilities go in DevTools, never back
    into DevFlare; apps never import each other (Nx `domain:*` tags); each app
    owns its own D1. See [spec 018](docs/specs/018-split-devtools-app.md).
11. **DevTools: local stays local.** A tool is `local` (browser only, no
    request to any server, no sign-in) unless it genuinely needs a server;
    only `connected` tools use DevTools' Worker, DevAuth and D1. DevAuth
    authenticates, DevTools authorizes (`DEVTOOLS_ALLOWED_USERS`, checked
    server side). See [spec 020](docs/specs/020-devtools-connected-foundation.md).

## Quick reference

- Package manager: **pnpm** (never npm/yarn). Node ≥ 22.
- Run everything: `pnpm dev:all` → DevFlare :4200, DevTools :4300, auth :8787.
- Test user: `test@devflare.com` / `TestPass123` (create with `pnpm seed:user`).
- TS path aliases: `@org/core`, `@org/ui`, `@dev-auth/angular`, `@org/deploy`,
  `@dev-auth/client`, `@dev-auth/core`, `@dev-auth/elements` (see
  `tsconfig.base.json`).
- DevFlare routes: AnalogJS file-based routing from
  `apps/devflare/src/app/pages/**/*.page.ts`. `(app).page.ts` wraps the
  authenticated app routes. Put guards/redirects in `routeMeta`; do not
  recreate a manual `app.routes.ts`.
- DevTools routes: `apps/devtools/src/app/pages/<slug>.page.ts`, registered in
  `apps/devtools/src/app/tools/tool-registry.ts` (use the `new-tool` skill).
- Main app API: `apps/devflare/src/server/routes/api/**` (Nitro/h3 file-based).
- Auth service: `apps/dev-auth/src/index.ts` (Hono on Cloudflare Workers).
- Generic agent skills (Claude + Codex) are installed by Agentyx from
  `.agentyx.json` — don't hand-edit them; see
  [WORKFLOWS › Agent tooling](docs/ai/WORKFLOWS.md#agent-tooling-agentyx).
- Branch workflow: `feature/*` branches → PR to `main`. Commit style: `feat: …`, `fix: …`.
