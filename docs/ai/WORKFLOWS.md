# WORKFLOWS — Run, test, verify, deploy

## Setup (once per machine)

```bash
pnpm install
cp .env.sample .env        # fill in at least BETTER_AUTH_SECRET
# optional, for dev-auth .flow compilation:
#   install the `flowmark` binary (Rust) — see docs/ai/STATE.md
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

- **App DB**: `data/devflare.db` (SQLite). Schema is created on server start in
  `apps/devflare/src/server/db/index.ts`. To reset: stop the app, delete the file.
- **Auth DB (local)**: wrangler's local D1 under `apps/dev-auth/.wrangler/state`.
  Migrations: `cd apps/dev-auth && npx wrangler d1 migrations apply dev-auth-db --local`.

## Deploy

Push to `main` triggers `.github/workflows/deploy.yml`. Manual deploy and full
production setup (D1/KV creation, secrets, domains, security checklist):
see [/DEPLOY.md](../../DEPLOY.md). Summary:

```bash
cd apps/dev-auth && npx wrangler deploy --env production   # auth service
pnpm build:prod                                            # main app bundle
```

## Troubleshooting quick hits

| Symptom                                    | Likely cause / fix                                                               |
| ------------------------------------------ | -------------------------------------------------------------------------------- |
| dev-auth build fails: `flowmark` not found | The Rust CLI isn't installed — see STATE.md. Don't hand-write `.flow.js`.        |
| Login returns "Invalid origin"             | `BETTER_AUTH_URL` mismatch, or missing `Origin` header on direct curl calls.     |
| Session not visible at :4200               | Both services running? The Nitro catch-all proxies `/api/auth/*` to :8787.       |
| Cookies lost in staging/prod               | `COOKIE_DOMAIN` must be the root domain (`.yourdomain.com`), same for both apps. |
| Rate-limited during testing (429)          | KV rate limit ~10 req/min/IP on auth endpoints — wait or restart local state.    |
| Port already in use                        | A previous `pnpm dev:all` still alive — kill node/wrangler processes.            |
