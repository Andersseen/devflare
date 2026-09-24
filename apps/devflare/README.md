# DevFlare (`apps/devflare`)

**Purpose: personal project hub.** One place to see every project, where it
runs, where its code lives and what shipped last — built on the owner's
Cloudflare account.

DevFlare is one of four products in this repository (see the root
[README](../../README.md)). "DevFlare repo" is the monorepo; "DevFlare app" is
this directory only.

## What it is

```
Projects                     ← the product
└── Project
    ├── live URL(s)
    ├── repository
    ├── Cloudflare resources (Pages projects, Workers)
    ├── deployments (Pages history, redeploy, link to rollback)
    └── actions (open site, open repository, open resource)

Cloud                        ← raw infrastructure behind it: every Worker,
                               Pages project, D1/KV/R2 on the account
Settings                     ← profile, Cloudflare integration, and — for
                               DevAuth administrators only — Identity admin
```

Projects are assembled from what Cloudflare reports, plus optional saved
metadata (repository URL, explicit resource link) in DevFlare's own D1.

## What it is not

- **Not a toolbox.** Browser utilities live in the separate DevTools app
  (`apps/devtools`). DevFlare shows one product-level "DevTools" link and no
  individual tools. Old `/tools/*` URLs redirect there when `DEVTOOLS_URL` is
  configured (`src/server/routes/tools`).
- **Not the identity provider.** Sign-in is delegated to DevAuth
  (`apps/dev-auth`) over OIDC; DevFlare keeps its own session.
- **Not Cloudflare Connect.** The Cloudflare OAuth code in `src/server/lib/`
  is DevFlare's own single-tenant connection; see `apps/cloudflare-connect`.
- **Not yet a monitor.** No analytics, logs, health checks or alerts yet.

## Internal routes

`/dev-auth-sdk` — the DevAuth Elements showcase used when developing the SDK.
Kept, deliberately absent from navigation.

## Run

```bash
pnpm dev:all     # DevAuth :8787 + DevFlare :4200 + DevTools :4300
pnpm dev:app     # DevFlare only (sign-in needs dev:auth too)
pnpm nx test devflare
pnpm nx e2e devflare-e2e
```

Deployment, secrets and domains: [DEPLOY.md](../../DEPLOY.md).
