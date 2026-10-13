# DevRadar (`apps/dev-radar`)

**Your development command center.**

DevRadar is a developer operations dashboard, initially for GitHub: one place
to see your repositories, their open pull requests, GitHub Actions results,
releases and recent activity. It reads GitHub through a **read-only GitHub App**
and signs you in with **DevAuth**.

It is the fifth product in this repository (see the root
[README](../../README.md)) and is independent of the others: it has its own
Worker, its own D1 database and its own DevAuth OAuth client, and it never
imports another app (Nx tag `domain:dev-radar`). Design and rationale:
[spec 021](../../docs/specs/021-dev-radar-foundation.md).

| Product            | Role                                               |
| ------------------ | -------------------------------------------------- |
| DevFlare           | Project hub + Cloudflare deployments               |
| DevTools           | Developer utilities                                |
| DevAuth            | Identity (OAuth 2.1 / OIDC)                        |
| **DevRadar**       | **GitHub monitoring (and, later, dev automation)** |
| Cloudflare Connect | Placeholder                                        |

## What v0.1.0 does

- **Overview** — repositories, open PRs, failing / running / no-CI counts,
  repositories needing attention, recent releases and activity.
- **Repositories** — searchable, filterable list (CI state, visibility, open
  PRs, archived) with default branch, latest commit, CI, open PRs, version and
  last sync; a **detail page** per repository (PRs, workflow runs, releases,
  activity, GitHub links).
- **Pull Requests** — all open PRs across repositories: author, draft, CI of the
  PR's head commit, labels, GitHub link. Release PRs are flagged **only** from
  documented signals (labels `release` / `autorelease: …`, or the branch
  prefixes `release-please--` / `changeset-release/`) — never from a title.
- **Activity** — normalized webhook events, newest first (30-day history).
- **Settings** — integration status (what is missing, by name), installations,
  connected repositories, last sync, manual **Sync now**, and the exact setup
  values for the GitHub App.
- **Honest states** — loading, error (with retry), empty, and an explicit
  _disconnected_ notice. There is no sample data anywhere in the app. A
  repository without workflows reads **No CI**, never _Passing_.

## Following repositories and customizing the dashboard (spec 022)

- **Installed vs followed.** _Installed_ (available) repositories are everything
  the GitHub App installation can read; they are synchronized as before.
  _Followed_ repositories are the ones you choose to see. Only followed
  repositories feed the Overview totals, "needs attention", releases, activity,
  pull requests and the Repositories list. Nothing is followed until you choose:
  a new account sees an onboarding state with **Select repositories**, and a
  synchronization never follows or unfollows anything.
- **Manage repositories** (Repositories page, or the Overview's _Select
  repositories_): search the full installed inventory, select several at once,
  save. Unfollowing only removes the repository from your dashboard — its
  synchronized data stays and `/repositories/:id` keeps working for any
  repository. It never changes the GitHub App installation or its permissions.
- **Edit dashboard**: drag cards (grip handle) or use _Move up / Move down_,
  _Move to group_, _Pin_ and _Unfollow_ on each card; add, rename, reorder and
  delete groups (deleting a group moves its repositories to _Uncategorized_);
  _Save layout_, _Cancel_, _Restore default layout_ (drops groups and pins, keeps
  what you follow). Preferences are stored per user in D1 (`dashboard_group`,
  `followed_repository`) keyed by GitHub's stable repository id, so renames and
  transfers keep them.
- **Accessibility.** Pointer drag-and-drop uses Quartz's native HTML drag and
  drop, which has no keyboard mode and is not guaranteed on touch. Every drag
  operation has a button equivalent, so editing is fully usable without
  dragging.
- API: `GET/PUT/DELETE /api/v1/dashboard-layout`, `GET /api/v1/repositories?scope=available`.
  Saves use the `PREFERENCES_RATE_LIMITER` binding (60/min per user).

## Architecture

```
Browser ─► DevRadar Worker (Static Assets + Nitro/h3)
             │  /                  prerendered shell, client-side data pages
             │  /api/auth/*        DevAuth OIDC client (PKCE) → dr_session cookie
             │  /api/v1/*          dashboard API (session + allowlist, D1 reads only)
             │  /api/github/webhook  GitHub → HMAC-verified, idempotent
             │  cron (6 h)         reconcile missed webhooks
             ▼
           D1  dev-radar-db   (DevRadar's own; nothing shared)

DevRadar ──► api.github.com   as a GitHub App installation, read-only, server side only
DevRadar ──► DevAuth          sign-in only (separate OAuth client)
```

- **Identity vs. access.** DevAuth proves _who_ you are. `DEVRADAR_ALLOWED_USERS`
  (user ids and/or emails, fail-closed when empty) decides who may _see_
  anything, checked server side on every request. **GitHub App installations**
  decide what DevRadar can _read_ — the two are unrelated. Signing in "with
  GitHub" through DevAuth does not give DevRadar any repository access.
- **State is mirrored, not fetched per page.** Pages read D1. GitHub is called
  by webhooks (cheap updates from the payload), by the manual **Sync now**, and
  by the cron reconcile — never because someone opened a page.
- **Data model** (`src/server/db/migrations/0000_init.sql`): GitHub numeric ids
  are the keys, so renames and transfers just update `full_name`.
  `github_installations`, `repositories`, `pull_requests` (open only),
  `workflow_runs` (latest 50/repo), `releases` (latest 10/repo),
  `webhook_deliveries` (14 days, payload never stored), `repository_events`
  (30 days, ≤200/repo), plus the session tables.
- **CI state** (`src/shared/ci-state.ts`): the newest default-branch commit
  that ran workflows; latest attempt per workflow; any failure → `failure`,
  else any unfinished → `pending`, else `success`; cancelled/skipped carry no
  signal; no runs → `none`; no data → `unknown`. A push is never treated as
  CI success, and CI for an older commit is labelled as such.
- **Domain events** (`src/shared/domain-events.ts`): webhooks are normalized
  into typed events — `repository.main.updated`, `repository.ci.passed`,
  `repository.ci.failed`, `pull_request.opened|merged|closed`,
  `release.published`, `installation.created|deleted`,
  `repository.added|removed` — and handed to a `DomainEventSink`. v0.1.0's sink
  writes the Activity feed. `ci.passed/failed` fire only when the recomputed
  state of the whole commit reaches a verdict, and **reconciliation publishes no
  events** (it is not news, and must not trigger future automation).
- **Sync** (`src/server/lib/sync`): bounded by a per-run request budget
  (`GITHUB_SYNC_REQUEST_BUDGET`, default 45 to fit Workers' free-plan
  subrequest cap), concurrency 3, least-recently-synced first (so a small budget
  still rotates through every repository), an installation lease against
  overlapping runs, pagination via `Link` headers, retry of 5xx, and graceful
  stop on rate limits (recorded on the installation, data left intact).
- **No Octokit.** The surface is a handful of read-only GETs plus the App-token
  exchange, so a ~150-line typed client over `fetch` + WebCrypto (RS256 JWT) is
  used instead: no dependency, runs unchanged in Workers, trivially faked in
  tests. PKCS#1 keys (what GitHub issues) are wrapped to PKCS#8 at runtime.

## Local development

```bash
pnpm install
cp apps/dev-radar/.dev.vars.example apps/dev-radar/.dev.vars   # then edit
pnpm db:migrate:radar:local        # local D1 (miniflare) → apps/dev-radar/.wrangler
pnpm dev:radar                     # http://localhost:4400
pnpm dev:all                       # DevAuth :8787 + DevFlare :4200 + DevTools :4300 + DevRadar :4400
```

To sign in locally you need DevAuth running (`pnpm dev:auth`) and the
`dev-radar-dev` client's secret on both sides:

1. Generate a secret: `openssl rand -base64 32`.
2. `apps/dev-radar/.dev.vars` → `DEV_AUTH_CLIENT_SECRET=<secret>`.
3. `apps/dev-auth/.dev.vars` → add `"dev-radar-dev":"<secret>"` to the
   `OAUTH_CLIENT_SECRETS` JSON object, then restart DevAuth.
4. `pnpm seed:user`, open <http://localhost:4400>, sign in as
   `test@devflare.com` (allowlisted locally in `wrangler.toml`).

Without GitHub App credentials the app runs in its **disconnected** state and
says so; it never invents data.

### Commands

| Command                       | Purpose                                      |
| ----------------------------- | -------------------------------------------- |
| `pnpm dev:radar`              | Dev server on :4400                          |
| `pnpm nx build dev-radar`     | Production build (prerender + Worker bundle) |
| `pnpm nx test dev-radar`      | Vitest                                       |
| `pnpm nx lint dev-radar`      | ESLint                                       |
| `pnpm nx typecheck dev-radar` | `tsc --noEmit`                               |
| `pnpm nx e2e dev-radar-e2e`   | Playwright (seeds its own local D1)          |
| `pnpm cf:radar <args>`        | `wrangler --cwd apps/dev-radar`              |
| `pnpm db:migrate:radar:local` | Apply migrations to the local D1             |
| `pnpm db:migrate:radar`       | Apply migrations to production D1 (remote)   |
| `pnpm deploy:radar`           | Manual build → migrate → deploy fallback     |

## Configuration

Variables live in `wrangler.toml` (`[vars]`, local defaults; `[env.production.vars]`
for production). **Secrets** go in `apps/dev-radar/.dev.vars` locally and
`wrangler secret put … --env production` when deployed — never in git.

| Name                         | Kind       | Purpose                                                            |
| ---------------------------- | ---------- | ------------------------------------------------------------------ |
| `DEV_AUTH_URL`               | var        | DevAuth issuer                                                     |
| `DEV_AUTH_CLIENT_ID`         | var        | `dev-radar-dev` locally, `dev-radar` in production                 |
| `DEV_AUTH_REDIRECT_URI`      | var        | `<origin>/api/auth/callback` — must match the registration exactly |
| `DEV_AUTH_CLIENT_SECRET`     | **secret** | OAuth client secret (matches DevAuth's `OAUTH_CLIENT_SECRETS`)     |
| `DEVRADAR_ALLOWED_USERS`     | var        | DevAuth user ids / emails allowed in. **Empty = nobody**           |
| `GITHUB_APP_ID`              | var        | Numeric App ID                                                     |
| `GITHUB_APP_SLUG`            | var        | App URL name → install link                                        |
| `GITHUB_APP_PRIVATE_KEY`     | **secret** | App private key PEM (PKCS#1 or #8; real or `\n`-escaped newlines)  |
| `GITHUB_WEBHOOK_SECRET`      | **secret** | Webhook HMAC secret                                                |
| `GITHUB_SYNC_REQUEST_BUDGET` | var        | Max GitHub requests per sync run (default 45)                      |

Rate-limit bindings (`AUTH_RATE_LIMITER`, `MUTATION_RATE_LIMITER`) are declared
in `wrangler.toml`; namespaces `2101`/`2102` (DevTools uses `2001`–`2003`).

DevFlare links here through `VITE_DEVRADAR_URL` (build time; the local port in
development; **no link at all** in a production build without a value).

## Register the DevAuth OAuth client

DevRadar must be its own client — never reuse another app's.

- **Local:** `dev-radar-dev`, redirect `http://localhost:4400/api/auth/callback`
  — already listed in `apps/dev-auth/wrangler.toml`; only its secret (above) is
  yours to add.
- **Production:** `dev-radar`, redirect `https://devradar.andersseen.dev/api/auth/callback`
  — already listed in DevAuth's production `OAUTH_CLIENTS`. Add
  `"dev-radar":"<secret>"` to DevAuth's `OAUTH_CLIENT_SECRETS` (re-`put` the
  whole JSON value), redeploy DevAuth, then
  `pnpm cf:radar secret put DEV_AUTH_CLIENT_SECRET --env production` with the
  same value. Until the secret exists DevAuth drops only that entry (logged);
  other clients are unaffected.
- Set `DEVRADAR_ALLOWED_USERS` to **your DevAuth user id** (`sub`, visible in
  DevFlare → Settings → Identity → Users). Prefer ids over emails: DevAuth does
  not verify email addresses yet.

## Create and install the GitHub App

Create it under the account that owns the repositories (Settings → Developer
settings → GitHub Apps → **New GitHub App**):

| Field                                                  | Value                                                            |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| Name / Homepage URL                                    | e.g. `DevRadar (you)` / your DevRadar URL                        |
| Callback URL, Setup URL                                | **leave empty** — users never authorize through GitHub           |
| Request user authorization (OAuth) during installation | **off**                                                          |
| Webhook → Active                                       | **on**                                                           |
| Webhook URL                                            | `https://<devradar-host>/api/github/webhook` (shown in Settings) |
| Webhook secret                                         | `openssl rand -hex 32` → also `GITHUB_WEBHOOK_SECRET`            |
| Where can it be installed                              | Only on this account (or the orgs you choose)                    |

**Repository permissions — all _Read-only_, nothing else:**

| Permission    | Used for                                                  |
| ------------- | --------------------------------------------------------- |
| Metadata      | Repository list and metadata (mandatory)                  |
| Contents      | Default-branch head commit, tags, releases, `push` events |
| Pull requests | Open PRs, `pull_request` events                           |
| Actions       | Workflow runs, `workflow_run` events                      |

No account or organization permissions. **No write permission is requested,**
and DevRadar contains no code that could use one.

**Subscribe to events:** Push, Pull request, Workflow run, Release.
(`installation` and `installation_repositories` are delivered to every GitHub
App automatically.)

Then: **Generate a private key** (downloads a `.pem`), and note the **App ID**
and the App's URL name (slug). Put them in config:

```bash
# local: apps/dev-radar/.dev.vars  (GITHUB_APP_ID / GITHUB_APP_SLUG may also go in wrangler.toml vars)
GITHUB_APP_ID=123456
GITHUB_APP_SLUG=devradar-you
GITHUB_WEBHOOK_SECRET=<the webhook secret>
GITHUB_APP_PRIVATE_KEY="$(cat ~/Downloads/your-app.private-key.pem)"   # or one line with \n escapes

# production
pnpm cf:radar secret put GITHUB_APP_PRIVATE_KEY --env production < your-app.private-key.pem
pnpm cf:radar secret put GITHUB_WEBHOOK_SECRET --env production
```

Install it: DevRadar → **Settings → Install the GitHub App** (or
`https://github.com/apps/<slug>/installations/new`), choose repositories, then
press **Sync now**. The installation webhook also starts an initial sync by
itself when webhooks reach DevRadar.

**Locally, GitHub cannot reach `localhost`.** Use a tunnel
(`cloudflared tunnel --url http://localhost:4400`, smee.io, ngrok) as the
webhook URL while developing, or skip webhooks and use **Sync now**. GitHub's
App → Advanced → _Recent deliveries_ lets you redeliver any event.

## D1

DevRadar owns `dev-radar-db`. Migrations are in `src/server/db/migrations/` and
are never edited once applied (add `0001_….sql`).

```bash
pnpm db:migrate:radar:local                       # local
pnpm cf:radar d1 create dev-radar-db              # once; paste the id into
                                                  # [[env.production.d1_databases]]
pnpm db:migrate:radar                             # production, remote
```

## Verify it end to end

1. `pnpm nx test dev-radar && pnpm nx e2e dev-radar-e2e` — everything below
   except real GitHub, deterministically.
2. Signed out: <http://localhost:4400> shows only the DevAuth sign-in; every
   `/api/v1/*` answers 401.
3. Signed in as an allowlisted user without GitHub credentials: Settings says
   **Disconnected** and names the missing settings; other pages show the notice
   and no data.
4. With the App configured and installed: **Sync now** → Repositories fills
   in; a repository with no workflows shows **No CI**.
5. Push to a default branch → **Activity** shows "Default branch updated"
   within seconds (and the repository's latest commit changes); CI shows the
   previous result flagged _for an older commit_ until workflows report.
6. Open/merge a PR → it appears on / leaves **Pull Requests**; a PR labelled
   `release` or from a `release-please--…` branch carries the **Release** badge.
7. GitHub → App → Advanced → redeliver a delivery → the response is
   `{"result":"duplicate"}`; a tampered body gets `401`.

## Deployment prerequisites

DevRadar is wired into the production workflow. Its first deployment still
requires the following one-time setup:

1. `pnpm cf:radar d1 create dev-radar-db` → paste the id into
   `[[env.production.d1_databases]]` in `wrangler.toml`.
2. DevAuth client secret (above) and `DEVRADAR_ALLOWED_USERS`.
3. GitHub App created and installed; `GITHUB_APP_ID`/`GITHUB_APP_SLUG` set in
   `[env.production.vars]`, the two secrets `put`.
4. Uncomment the `[[env.production.routes]]` block (this creates DNS on
   deploy), set the webhook URL on the App to that host.
5. `pnpm nx build dev-radar && pnpm cf:radar deploy --env production --dry-run`.
6. Merge to `main`; the `deploy-radar` job in `.github/workflows/deploy.yml`
   applies migrations, builds and deploys it. `pnpm deploy:radar` remains
   available as a manual fallback.
7. Optional: set `VITE_DEVRADAR_URL` when building DevFlare to link to it.

See also [DEPLOY.md › DevRadar](../../DEPLOY.md).

## Known limitations (v0.1.0)

- **CI = GitHub Actions workflow runs only.** Third-party commit statuses and
  non-Actions check runs are not read.
- **PR "checks"** are the workflow runs of the PR's head commit. Review state,
  mergeability and required-check rollups are not shown (the list API does not
  provide them reliably); they are left out rather than guessed.
- **Per-run request budget** (default 45): a very large account takes a few
  syncs to import fully; Settings shows how many repositories remain. Raise
  `GITHUB_SYNC_REQUEST_BUDGET` on a paid Workers plan. A permanently failing
  repository is retried first on every run.
- Bounded windows: ≤300 open PRs and the latest 50 runs / 10 releases per
  repository; ≤1000 repositories and 300 installations.
- A layout save is several ordered statements (upserts first, prunes last), not
  one transaction; two concurrent saves from different tabs are last-writer-wins.
- D1 has no multi-statement transactions through `db0`; writes are ordered and
  idempotent (guarded upserts) instead, so a failed run is safe to repeat.
- Single-owner access model (an allowlist), not multi-tenant: every allowed
  user sees every connected repository.
- Webhook ordering is guarded for PRs, runs and the head commit; a missed
  `release` or `installation` event is repaired by the next reconcile.

## Toward v0.2.0 — the automation engine (not built)

The goal is to generate a **next-development prompt** when a default branch
changes and its CI has finished green. v0.1.0 deliberately only prepares the
ground:

- The trigger is already a typed contract: `repository.main.updated` followed by
  `repository.ci.passed` for the same commit (`DomainEvent`, `DomainEventSink`).
  A second sink beside the Activity writer is where an engine subscribes.
- Per-repository **rules** (branch, "wait for CI", cool-down) and a repository
  **context** document are new tables keyed by the GitHub repository id.
- **Prompt history**, a **provider** abstraction and **notifications** build on
  those; nothing here is wired, and no table, route, UI or dependency exists for
  them yet.

Recommended next minor: per-repository rules + context with prompt generation
behind an explicit, read-only "preview prompt" action before any provider call.
