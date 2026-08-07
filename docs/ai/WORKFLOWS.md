# WORKFLOWS — Run, test, verify, deploy

## Setup (once per machine)

```bash
pnpm install
cp .env.sample .env        # fill in at least BETTER_AUTH_SECRET
```

## Daily development

```bash
pnpm dev:all      # auth (:8787) + app (:4200) together
pnpm dev:app      # app only  → http://localhost:4200
pnpm dev:auth     # auth only → http://localhost:8787
pnpm seed:user    # create test user (auth service must be running)
```

Test login: `test@devflare.com` / `TestPass123`.

Editing dev-auth pages? Run the template watcher in a second terminal:

```bash
pnpm --filter @devflare/dev-auth watch:flow
```

## Quality gates — run before saying "done"

```bash
pnpm format:check   # Prettier (use format:write to fix)
pnpm lint           # ESLint across all projects
pnpm typecheck      # tsc across all projects
pnpm test           # Vitest across all projects
pnpm check          # all of the above + production build (slowest, most complete)
```

Scoped/faster variants: `nx test devflare`, `nx lint dev-auth`,
`nx affected -t test lint build` (only what changed).

## Verifying a change actually works (not just compiles)

1. Tool page change → open `http://localhost:4200/tools/<tool>` and exercise it.
2. Auth change → run the curl flow:
   ```bash
   curl -X POST http://localhost:8787/api/auth/sign-in/email \
     -H "Content-Type: application/json" -H "Origin: http://localhost:8787" \
     -d '{"email":"test@devflare.com","password":"TestPass123"}' -c /tmp/c.txt
   curl http://localhost:8787/api/auth/get-session -b /tmp/c.txt
   ```
3. App API change → `curl http://localhost:4200/api/v1/projects -b /tmp/c.txt`
   (cookies from step 2 work through the proxy).
4. E2E: `nx e2e devflare-e2e` (Playwright; needs both services running).

## Database

Both apps use Cloudflare D1. Locally that is wrangler's miniflare state under
`apps/<app>/.wrangler/state` — there is no SQLite file to delete any more.

```bash
pnpm db:migrate:local    # apply migrations to both local D1s
pnpm db:migrate          # both, production, remote
```

- **App DB** (`devflare-db`): migrations in
  `apps/devflare/src/server/db/migrations/`.
- **Auth DB** (`dev-auth-db*`): migrations in `apps/dev-auth/src/db/migrations/`.

Migration commands take the **binding** (`DB`), not a database name — under
`--env production` the bound database is `dev-auth-db-prod`, so a bare
`dev-auth-db` will not resolve.

## Deploy

Everything is on Cloudflare Workers: the app at `devflare.andersseen.dev`, the
auth service at `auth-devflare.andersseen.dev`. Push to `main` triggers
`.github/workflows/deploy.yml`.

All scripts run **from the repo root** (they wrap `wrangler --cwd`, so no `cd`):

```bash
pnpm deploy:dry       # build + validate both workers, ships nothing
pnpm deploy:all       # auth then app, each migrating its D1 first
pnpm deploy:auth      # just the auth worker
pnpm deploy:app       # build:prod + migrate + deploy the app worker
pnpm deploy:staging   # auth service only — the app has no staging env
pnpm cf:tail:app      # live logs
```

`deploy:app` builds first on purpose: `apps/devflare/wrangler.toml` points
`main` and `[assets]` at `dist/`, so deploying without a fresh build ships stale
output. Full production setup (resources, secrets, domains, Vercel teardown):
see [/DEPLOY.md](../../DEPLOY.md).

## Troubleshooting quick hits

| Symptom                                | Likely cause / fix                                                                                                                                                                                                               |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth pages render unstyled             | The `@andersseen/*` CDN hosts must be in **both** `script-src` and `style-src` of the CSP in `apps/dev-auth/src/middleware/security-headers.ts`. With only `script-src`, the components upgrade but every stylesheet is blocked. |
| An auth form says "fill in all fields" | `and-input` emits `andInputChange`, not `andInput`. Read `input.value` off the element instead of accumulating events. Check the pinned CDN version in `pages/layout.ts` after any upstream bump.                                |
| Login returns "Invalid origin"         | `BETTER_AUTH_URL` mismatch, or missing `Origin` header on direct curl calls.                                                                                                                                                     |
| Session not visible at :4200           | Both services running? The Nitro catch-all proxies `/api/auth/*` to :8787.                                                                                                                                                       |
| Cookies lost in staging/prod           | `COOKIE_DOMAIN` must be the root domain (`.yourdomain.com`), same for both apps.                                                                                                                                                 |
| Rate-limited during testing (429)      | KV rate limit ~10 req/min/IP on auth endpoints — wait or restart local state.                                                                                                                                                    |
| Port already in use                    | A previous `pnpm dev:all` still alive — kill node/wrangler processes.                                                                                                                                                            |
