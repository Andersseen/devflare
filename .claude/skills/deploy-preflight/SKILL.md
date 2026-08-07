---
name: deploy-preflight
description: Verify a Cloudflare deploy will actually succeed before merging to main — token account and scopes, D1 bindings, required secrets, pending migrations, and a dry-run of both workers.
disable-model-invocation: true
---

# Deploy preflight

`Deploy to Production` runs a full `pnpm check` (several minutes) **before** it
touches Cloudflare, so a credentials problem surfaces at the very end of a job
that was doomed from the first second. Every production deploy from 2026-07-06
to 2026-08-04 failed this way.

This runs the credential and binding checks first, in about twenty seconds, and
never mutates anything: every command is read-only or `--dry-run`.

Report a single pass/fail table at the end. Do not deploy — that is
`pnpm deploy:all`, and it is the user's call.

## 1. Identity and scopes

```bash
npx wrangler whoami
```

Record the **Account ID** and confirm the token grants `d1 (write)`. Both are
load-bearing:

- Missing `d1 (write)` → `migrations apply` fails with
  `[code: 7403] The given account is not valid or is not authorized`.
- An account that does not own the databases → the **same 7403**. The error text
  does not distinguish the two cases, which is why step 2 exists.

## 2. The bound databases exist in that account

```bash
npx wrangler d1 list
```

Cross-check every `database_id` against the config:

```bash
grep -n "database_id\|database_name\|binding" apps/dev-auth/wrangler.toml apps/devflare/wrangler.toml
```

Each `database_id` in a `[[env.production.d1_databases]]` block must appear in
the `wrangler d1 list` output. A mismatch means either the wrong account or a
database that was deleted and recreated (recreating changes the id).

Also confirm each `d1_databases` block sets `migrations_dir` — without it
`migrations apply` looks in the wrong place and reports "no migrations to
apply", which reads like success.

## 3. Required secrets are set

Vars live in `wrangler.toml` and deploy with the worker. Secrets do not — they
are set once per environment and are invisible in the repo.

```bash
npx wrangler secret list --env production --cwd apps/dev-auth
```

`apps/dev-auth` reads these at runtime; flag any that are missing:

| Name                   | Required?           | Consequence if unset                          |
| ---------------------- | ------------------- | --------------------------------------------- |
| `BETTER_AUTH_SECRET`   | yes                 | every session token is invalid; login is dead |
| `ADMIN_SECRET`         | yes                 | admin endpoints unguarded or permanently 500  |
| `GITHUB_CLIENT_ID`     | only for GitHub SSO | OAuth button fails at the redirect            |
| `GITHUB_CLIENT_SECRET` | only for GitHub SSO | OAuth callback rejects the code exchange      |
| `SENTRY_DSN`           | optional            | errors simply go unreported                   |

Do **not** print secret values, and do not offer to set them — `wrangler secret
put` is interactive and belongs to the user.

## 4. GitHub Actions has the same credentials

The workflows authenticate from repository secrets, not from the local token, so
a green local check proves nothing about CI:

```bash
gh secret list
```

`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` must both exist. Their values
are not readable — if steps 1–2 pass locally but CI still returns 7403, the
repository token is the culprit and must be regenerated with **D1:Edit** for the
account found in step 1.

## 5. Pending migrations

```bash
npx wrangler d1 migrations list DB --env production --remote --cwd apps/dev-auth
npx wrangler d1 migrations list DB --env production --remote --cwd apps/devflare
```

Target the **binding** (`DB`), never the database name — under `--env
production` the bound database is `dev-auth-db-prod`, so a literal name fails to
resolve. List the unapplied migrations so the user knows what the deploy will
run. If any look destructive, stop and hand off to the `d1-migration-reviewer`
agent.

## 6. Both workers build and bundle

```bash
pnpm nx build devflare --configuration production
npx wrangler deploy --env production --dry-run --cwd apps/devflare
npx wrangler deploy --env production --dry-run --cwd apps/dev-auth
```

The app worker's `main` points at `dist/apps/devflare/analog/server/index.mjs`,
so the build must run first or the dry-run resolves nothing. `dev-auth` compiles
its `.flow` templates through wrangler's `[build]` command, so a broken `.flow`
surfaces here.

## Output

```
| Check                        | Result |
| ---------------------------- | ------ |
| Token scopes (d1:write)      | ✅/❌   |
| Account owns both databases  | ✅/❌   |
| dev-auth secrets set         | ✅/❌   |
| GitHub Actions secrets exist | ✅/❌   |
| Pending migrations           | N      |
| Dry-run: devflare            | ✅/❌   |
| Dry-run: dev-auth            | ✅/❌   |
```

For each ❌ give the one command or dashboard action that fixes it. If
everything passes, say the deploy is clear and stop.
