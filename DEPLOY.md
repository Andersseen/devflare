# Production Deployment Guide

Everything runs on Cloudflare. Two Workers, two D1 databases.

## Architecture

```
        devflare.andersseen.dev          auth-devflare.andersseen.dev
┌───────────────────────────┐      ┌──────────────────────────────┐
│  DevFlare App             │◄────►│  DevAuth Service             │
│  Worker + Static Assets   │      │  Worker (Hono + better-auth) │
│  Nitro `cloudflare-module`│      │                              │
│  D1: devflare-db          │      │  D1: dev-auth-db-prod        │
│                           │      │  KV: rate limiting           │
└───────────────────────────┘      └──────────────────────────────┘
```

Both sit under `andersseen.dev`, so the session cookie is same-site and no
cross-origin credential handling is needed.

## Prerequisites

- [Cloudflare account](https://dash.cloudflare.com)
- [Node.js 22+](https://nodejs.org) and [pnpm 10+](https://pnpm.io)
- GitHub repository with Actions enabled

## 1. Cloudflare Resources

**Already provisioned on 2026-07-28** — their real IDs are committed in the
`wrangler.toml` files, and all migrations have been applied remotely. This
section is for rebuilding from scratch or adding an environment.

| Resource | Name                          | Used by                            |
| -------- | ----------------------------- | ---------------------------------- |
| D1       | `devflare-db`                 | app, `apps/devflare/wrangler.toml` |
| D1       | `dev-auth-db-prod`            | auth, `[env.production]`           |
| D1       | `dev-auth-db-staging`         | auth, `[env.staging]`              |
| KV       | `dev-auth-rate-limit-prod`    | auth rate limiting, production     |
| KV       | `dev-auth-rate-limit-staging` | auth rate limiting, staging        |

```bash
npx wrangler d1 create <name>
npx wrangler kv namespace create <name>
```

Copy each returned id into the matching `database_id` / `id` field.

### Apply migrations

Every command below runs **from the repo root** — the `pnpm` scripts wrap
`wrangler --cwd`, so there is no `cd`.

```bash
pnpm db:migrate          # both apps, production, remote
pnpm db:migrate:local    # both apps, local miniflare
```

The scripts pass the **binding** (`DB`), not a database name: under
`--env production` the bound database is `dev-auth-db-prod`, so a bare
`dev-auth-db` would not resolve.

## 2. Secrets

Set the following secrets via Wrangler or GitHub Actions:

### Via Wrangler CLI

> **Order matters on a first-time setup.** Secret commands target an existing
> Worker — before the first deploy they fail with `Worker "dev-auth-prod" not
found`. So run `pnpm deploy:auth` first, then set the secret. Secrets apply
> immediately and do not need a redeploy, so the brief window where the Worker
> is up without `BETTER_AUTH_SECRET` is fine as long as you set it right after.

```bash
# Auth secret (generate a strong random string)
# openssl rand -base64 32
pnpm cf:secret:auth BETTER_AUTH_SECRET

# Cloudflare API token (for GitHub Actions)
# Create at: https://dash.cloudflare.com/profile/api-tokens
# Required permissions: Cloudflare Workers Edit, D1 Edit, KV Edit
```

### GitHub Repository Secrets

Go to **Settings → Secrets and variables → Actions** and add:

| Secret                  | Description                                    |
| ----------------------- | ---------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | API token with Workers, D1, and KV permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID                     |

Account ID for this project: `c32a93ee83fe9b5d53c63fcc73b90bb9`
(`pnpm cf:app whoami` prints it).

## 3. Environment Variables

### DevAuth Service (`wrangler.toml`)

Update production variables:

```toml
[env.production.vars]
BETTER_AUTH_URL = "https://auth-devflare.andersseen.dev"
ENVIRONMENT = "production"
DEV_AUTH_CORS_ORIGINS = "https://devflare.andersseen.dev"
COOKIE_DOMAIN = ".andersseen.dev"
```

`COOKIE_DOMAIN` is required, not optional. The app and auth service are separate
subdomains, so without it the session cookie is host-only to the auth Worker and
the browser never sends it to the app — login succeeds, then every request 401s.

### DevFlare App

`DEV_AUTH_URL` is a Worker var, not a `.env` file — it lives in
`[env.production.vars]` of `apps/devflare/wrangler.toml`. The top-level value is
the local-dev one (`http://localhost:8787`), because that is what wrangler's
`getPlatformProxy()` reads during `pnpm dev:app`.

## 4. Domain Configuration

Both domains are declared as `custom_domain` routes in their `wrangler.toml`, so
`wrangler deploy` creates the DNS records — nothing to click in the dashboard.
This requires `andersseen.dev` to be an active zone on the account.

| Worker     | Domain                         |
| ---------- | ------------------------------ |
| `devflare` | `devflare.andersseen.dev`      |
| `dev-auth` | `auth-devflare.andersseen.dev` |

## 5. Deploy

### Manual Deploy

All of these run **from the repo root**. Each `deploy:*` script applies its D1
migrations before shipping.

```bash
pnpm deploy:dry       # build + validate both workers, ships nothing
pnpm deploy:all       # auth, then app
pnpm deploy:auth      # auth worker only
pnpm deploy:app       # app worker only (builds first)
pnpm deploy:staging   # auth worker, staging env
```

`deploy:app` runs `build:prod` first on purpose: `apps/devflare/wrangler.toml`
points `main` and `[assets]` at `dist/`, so deploying without a fresh build would
ship stale output.

For anything not covered by a script, `pnpm cf:auth <args>` and
`pnpm cf:app <args>` forward straight to `wrangler --cwd apps/<app>`:

```bash
pnpm cf:app whoami
pnpm cf:auth d1 execute DB --env production --remote --command "SELECT COUNT(*) FROM user"
```

### Automatic Deploy (GitHub Actions)

Push to `main` runs `.github/workflows/deploy.yml`: `verify` (full `pnpm check`)
then `deploy-auth` and `deploy-app` in parallel, each applying its D1 migrations
first.

## 6. Post-Deploy Verification

```bash
# Health checks
curl https://auth-devflare.andersseen.dev/health
curl https://devflare.andersseen.dev/api/health

# Test login flow
curl -X POST https://auth-devflare.andersseen.dev/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"test@devflare.com","password":"TestPass123"}'
```

## 7. Decommissioning Vercel

The repo never contained Vercel config — there is no `vercel.json` and no
adapter. The old deployment came from Vercel's Git integration, configured in
the Vercel dashboard, so **removing it is a dashboard action; nothing in this
repo controls it.**

Do this only after step 6 passes, in order:

1. Confirm `https://devflare.andersseen.dev` serves the app and login works.
2. In the Vercel dashboard, open the DevFlare project →
   **Settings → Git → Disconnect** so pushes to `main` stop triggering builds.
   Do this before deleting anything, or a push can redeploy the old site.
3. Move any custom domain still pointing at Vercel over to the Worker. If the
   DNS record lives in Cloudflare, deleting the Vercel `CNAME`/`A` record and
   letting `wrangler deploy` recreate it as a custom domain is enough.
4. Check Vercel project **Settings → Environment Variables** for anything that
   exists nowhere else (it should be nothing — the app's only server config is
   `DEV_AUTH_URL`) and copy it into `wrangler.toml` vars or a Worker secret.
5. Delete the Vercel project once you are happy to lose its deployment history.

Nothing else in the codebase references Vercel, so no code change is needed.

## 8. Optional Features

### GitHub OAuth

1. Create a GitHub OAuth App: https://github.com/settings/applications/new
2. Set Authorization callback URL to:
   `https://auth-devflare.andersseen.dev/api/auth/callback/github`
3. Set secrets:
   ```bash
   npx wrangler secret put GITHUB_CLIENT_ID --env production
   npx wrangler secret put GITHUB_CLIENT_SECRET --env production
   ```

### Email Verification

Email verification is enabled by default. In production, integrate with Resend:

```bash
pnpm add resend
```

Update `auth.config.ts`:

```ts
import { Resend } from 'resend';

emailVerification: {
  sendVerificationEmail: async ({ user, url }) => {
    const resend = new Resend(env.RESEND_API_KEY);
    await resend.emails.send({
      from: 'auth@andersseen.dev',
      to: user.email,
      subject: 'Verify your email',
      html: `<a href="${url}">Verify email</a>`,
    });
  },
},
```

### Analytics

Track events from the frontend:

```ts
fetch('/api/analytics/event', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ event: 'page_view', path: '/projects' }),
});
```

View events (admin only):

```bash
curl -H "Authorization: Bearer $ADMIN_SECRET" \
  https://auth-devflare.andersseen.dev/api/analytics/events
```

## 9. Security Checklist

- [ ] `BETTER_AUTH_SECRET` is a strong random string (32+ chars)
- [ ] `BETTER_AUTH_URL` points to HTTPS domain (not localhost)
- [ ] `DEV_AUTH_CORS_ORIGINS` is explicitly set (no wildcards)
- [ ] `COOKIE_DOMAIN` matches your root domain
- [ ] D1 database has migrations applied
- [ ] KV namespace is created for rate limiting
- [ ] `/api/setup/*` endpoints return 403 in production
- [ ] `ENVIRONMENT=production` is set
- [ ] `ADMIN_SECRET` is set for protected endpoints
- [ ] GitHub secrets are set (if using OAuth)

## Troubleshooting

### "Invalid origin" errors

Ensure `BETTER_AUTH_URL` matches the domain you're accessing the service from.

### Cookies not persisting

Check `COOKIE_DOMAIN` is set to the shared parent domain (`.andersseen.dev`).

### D1 migration errors

Run migrations manually:

```bash
npx wrangler d1 migrations apply dev-auth-db --env production --remote
```
