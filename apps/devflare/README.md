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

## Customizing the Projects dashboard (spec 022)

**Edit dashboard** on the Projects page: reorder saved project cards (drag by
the grip, or _Move up/down_ and _Move to group_), create / rename / reorder /
delete groups, hide and restore cards, then _Save layout_ (or _Cancel_, or
_Restore default layout_). The layout is stored per user in this app's D1.

Three things are kept deliberately separate:

| Concept                                                      | Where                               | Effect                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Visual grouping / hiding                                     | `dashboard_group`, `dashboard_item` | Presentation only. Moving or hiding a card never changes which Cloudflare resources a project owns and deletes nothing.                                                                                                                                                  |
| Discovery groups (formerly the hardcoded `WATCHED_PROJECTS`) | code seed + `discovery_identity`    | Which _unowned_ Workers/Pages are suggested together by name or alias. Edit names/aliases in edit mode; your edits override the built-in defaults. Only built-in groups carry _verified_ domains; domains cannot be entered by hand. Suggestions only — never ownership. |
| Resource ownership                                           | `project_resource` (spec 019)       | The only thing that says a resource belongs to a project. Linked through the project page or **Assign to project** on a discovered card, which uses the same verified, permission-checked link API.                                                                      |

Discovered (not saved) cards can be hidden and restored but stay in their own
section; nothing is saved as a project without an explicit action. Without
Cloudflare access, _Assign_ is disabled and says why.

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
