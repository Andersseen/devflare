# cloudflare-connect

Architectural placeholder for **Cloudflare Connect** — a future, separately
deployable service that answers _"which Cloudflare resources has this user
authorized an application to access?"_. It does not exist yet as a working
service; this app is the boundary that keeps that future work from being
bolted onto `dev-auth` or `devflare`. See
[docs/specs/013-dev-auth-modular-architecture.md](../../docs/specs/013-dev-auth-modular-architecture.md)
for the full decision record and the migration map for the Cloudflare OAuth
code that already exists in `apps/devflare/src/server/lib/`.

## Responsibility

- Delegated authorization for Cloudflare account resources: account
  selection, OAuth scopes, access/refresh tokens, grant revocation.
- Multi-tenant by design: a grant belongs to whoever authorized it, not to
  "the install" the way `apps/devflare`'s current Cloudflare connection does.

## Non-responsibilities

- **Not identity.** It does not know who a human is in the sense `dev-auth`
  does — no users, no sessions, no login. A consumer application may choose
  to associate a grant with a `dev-auth` identity, but that composition is
  the consumer's job, not this service's (see the ADR, "Step 12").
- **Not implemented yet.** No OAuth flow, no token persistence, no D1 schema,
  no account selection, no scope negotiation, no Cloudflare API calls. Only a
  health endpoint exists today.

## Dependencies

Must not import from `apps/dev-auth` or `apps/devflare`. May depend on
`libs/cloudflare-connect/*` once a framework-independent core is justified
(there is nothing to extract into one yet — see the ADR). Enforced by the
`domain:cloudflare-connect` Nx tag and its `depConstraints` entry in the root
`eslint.config.mjs`.

## Deployment model

Its own Cloudflare Worker (`wrangler.toml`), its own `dev`/`deploy` targets,
independent of `dev-auth` and `devflare`. A change here must never require
redeploying either of those, and a change to either of those must never
require redeploying this.

## Data ownership

Will eventually own its own D1 (or equivalent) grant store, separate from
`dev-auth-db*` and `devflare-db`. See the ADR's "Step 10 — configuration
ownership": Cloudflare OAuth client id/secret, a grant encryption key, and the
grant store itself belong here, not to `dev-auth`.

## Security ownership

Compromise here affects only authorized Cloudflare resources — not identity,
sessions, or SSO. That is the point of keeping it a separate deployable with
separate secrets and separate persistence rather than a feature inside
`dev-auth`.

## Consumer examples

An application that only needs identity uses `dev-auth` (optionally through
`@org/dev-auth-core`/`@org/auth`) and never touches this service. An
application that only needs Cloudflare resource access will eventually use
this service directly, with no `dev-auth` dependency. An application that
needs both (e.g. a future Imageryx feature) composes them itself — neither
service needs to know the other exists.

## Local development

```bash
cd apps/cloudflare-connect
pnpm dev        # wrangler dev --local
curl localhost:8788/health
```

No `.dev.vars` are required yet — there are no secrets to configure.
