# 013 — DevAuth ecosystem: modular architecture foundation

| Field   | Value                                   |
| ------- | --------------------------------------- |
| Status  | Done                                    |
| Branch  | `feature/dev-auth-modular-architecture` |
| Created | 2026-09-11                              |
| Updated | 2026-09-11                              |

## 1. Summary

DevAuth is now documented and enforced as **three related but independently
usable layers** — Identity (`apps/dev-auth`), a Consumer SDK
(`libs/shared/dev-auth-core`, `libs/shared/auth`, and a future optional UI),
and Cloudflare Connect (a new, deliberately empty `apps/cloudflare-connect`
boundary) — with Nx `domain:*` tags and `depConstraints` that make the wrong
dependency direction a lint error instead of a convention someone has to
remember. No feature code moved and no feature was built; this is a
boundary-drawing pass only.

## 2. Problem / Motivation

DevAuth started as "DevFlare's auth service" and grew into an identity
provider other apps register against (Ally, and previously Imageryx),
plus a headless consumer SDK (`@org/dev-auth-core` + `@org/auth`, shipped in
PR #31), plus — sitting inside DevFlare's own server code —
a second, unrelated OAuth client for Cloudflare's _own_ self-managed-OAuth
API access (`apps/devflare/src/server/lib/cloudflare-oauth*.ts`,
`cloudflare-connection.ts`, specs 007/010). Nothing currently stops a future
change from wiring Cloudflare account tokens into `dev-auth`'s identity core,
or from making Cloudflare Connect a new backend for DevAuth users — both of
which would be a real security regression (identity compromise and
infrastructure-grant compromise becoming the same blast radius) and would
block deploying the two independently. This spec draws that boundary now,
before Cloudflare Connect has any real implementation to migrate.

## 3. Goals & Non-goals

- **Goals**: classify existing code into the three layers; add Nx
  `domain:*` tags and `depConstraints` that make DevAuth Identity ↛
  Cloudflare Connect ↛ DevFlare (and back) a lint failure; scaffold a
  minimal, non-functional `apps/cloudflare-connect` as the future home for
  the Cloudflare OAuth broker; produce a migration map for the Cloudflare
  OAuth code that already exists in DevFlare; correct `docs/ai/STATE.md`
  drift; document configuration/security ownership per layer.
- **Non-goals**: implementing the Cloudflare OAuth broker, its token store,
  account selection, or scopes; building any DevAuth UI component
  (`SignIn`/`UserButton`/`UserProfile` — already in flight, unmerged, as PR
  #32/`feature/012-dev-auth-angular-ui`, out of scope here — see §9); moving
  or rewriting `apps/devflare/src/server/lib/cloudflare-*.ts`; renaming
  `@org/auth` or `@org/dev-auth-core`; any new authentication provider, MFA,
  organizations, or billing.

## 4. Bounded contexts and dependency direction

```
                     DevAuth ecosystem

  ┌───────────────────────────┐
  │   domain:dev-auth         │   apps/dev-auth — mini Keycloak.
  │   apps/dev-auth            │   OAuth 2.1 / OIDC provider, users,
  │                            │   sessions, consent, SSO, GitHub +
  │                            │   email/password. Self-contained: it
  │                            │   imports nothing else in this repo
  │                            │   today (verified — see §5), and the
  │                            │   new depConstraint keeps it that way.
  └───────────────────────────┘
               ▲ OIDC (HTTP, not an import)
               │
  ┌───────────────────────────┐
  │   domain:dev-auth-sdk      │   libs/shared/dev-auth-core (@org/dev-auth-core)
  │                            │     framework-agnostic OAuth 2.1/OIDC client
  │                            │     (discovery, PKCE, code exchange, userinfo).
  │                            │   libs/shared/auth (@org/auth)
  │                            │     Angular signals adapter for a CONSUMER
  │                            │     APP'S OWN session cookie — never speaks
  │                            │     OAuth itself (see §5, "a subtlety").
  │                            │   (future) libs/shared/auth-ui (@org/auth-ui)
  │                            │     — already built, unmerged. See §9.
  └───────────────────────────┘
               ▲
               │ used by (not owned by)
  ┌───────────────────────────┐
  │   domain:devflare          │   apps/devflare — a consumer, like any
  │                            │   other app that could register with
  │                            │   dev-auth. May depend on dev-auth-sdk
  │                            │   and cloudflare-connect; they may not
  │                            │   depend back on it.
  └───────────────────────────┘

  ┌───────────────────────────┐
  │  domain:cloudflare-connect │   apps/cloudflare-connect — future
  │                            │   deployable OAuth broker for delegated
  │                            │   Cloudflare infrastructure access.
  │                            │   Today: a health endpoint and nothing
  │                            │   else (see §7). Independent of dev-auth;
  │                            │   an application may use it without ever
  │                            │   authenticating through dev-auth (§11,
  │                            │   Consumer E).
  └───────────────────────────┘

  domain:shared — libs/shared/ui, libs/deploy: generic infrastructure with
  no domain of its own. May be depended on by anything; depends on nothing
  domain-specific.
```

Enforced rules (`eslint.config.mjs`, `@nx/enforce-module-boundaries`):

| Source tag                  | May depend on                                                                          |
| --------------------------- | -------------------------------------------------------------------------------------- |
| `domain:dev-auth`           | `domain:dev-auth` only                                                                 |
| `domain:dev-auth-sdk`       | `domain:dev-auth-sdk` only (no Angular/UI-specific tag distinction yet — see §6)       |
| `domain:cloudflare-connect` | `domain:cloudflare-connect`, `domain:shared`                                           |
| `domain:devflare`           | `domain:devflare`, `domain:dev-auth-sdk`, `domain:cloudflare-connect`, `domain:shared` |
| `domain:shared`             | `domain:shared` only                                                                   |

This is a **second, independent tag dimension**, additive to the repo's
existing `scope:{frontend,backend,shared}` / `type:{app,service,core,ui,feature}`
tags (which encode a different axis — physical layering, not product/bounded
context — and which this spec leaves alone; the `scope:frontend`/`scope:shared`
rules already there predate this work). A project's imports must satisfy
every `depConstraints` rule that matches one of its own tags, so both
dimensions apply simultaneously. One small existing-gap fix rides along:
`scope:backend` (i.e. `apps/dev-auth`, `apps/cloudflare-connect`) had **no**
`depConstraints` rule at all before this change — nothing stopped a backend
Worker from importing frontend/Angular code. Added
`scope:backend → [scope:backend, scope:shared]`, mirroring the existing
`scope:frontend` rule.

Verified the rule actually fires: temporarily added
`import '@org/dev-auth-core'` to `apps/dev-auth/src/index.ts` and confirmed
`nx run dev-auth:lint` fails with
`A project tagged with "domain:dev-auth" can only depend on libs tagged with "domain:dev-auth"`,
then reverted it. Not left behind as a committed test — Nx module-boundary
lint is itself the boundary test (per this task's own instruction to prefer
that over a brittle text-search check), and it now runs on every `pnpm lint`.

## 5. Dependency audit (as found, before this change)

Traced with `grep`/`git show`, not assumed:

- **`apps/dev-auth`** imports nothing from `apps/devflare`, `libs/shared/*`,
  or the not-yet-existing `apps/cloudflare-connect`. Fully self-contained
  already. Test fixtures use the string `"devflare"` as a generic example
  `clientId` — that's test data, not a code dependency, and was confirmed by
  reading the fixture, not just grepping the string.
- **`libs/shared/dev-auth-core`** (`@org/dev-auth-core`) is genuinely
  framework-agnostic: `createDevAuthClient({ issuer, clientId, ... })` takes
  an arbitrary issuer URL — it is a standards-based OIDC relying-party
  client, not hardcoded to dev-auth's own issuer despite the package name.
  Imported by `apps/devflare/src/server/lib/oidc.ts` (dev-auth consumer) and
  by `apps/devflare/src/server/lib/cloudflare-oauth.ts` (a _different_,
  unrelated OAuth client — Cloudflare's own authorization server — reusing
  only the generic RFC 6749/7636 primitives: `codeChallenge`,
  `createCodeVerifier`, `createState`). That second import is legitimate
  today (a consumer reusing generic protocol helpers is the allowed
  direction) but is worth a name asterisk — see §8.
- **`libs/shared/auth`** (`@org/auth`) — **a subtlety worth recording
  explicitly**: it does **not** import `@org/dev-auth-core` and is not an
  OAuth client at all. It is an Angular-side facade over a _consumer app's
  own_ same-origin session endpoints (`/api/auth/session|login|logout`,
  cookie-based). The actual OAuth/OIDC exchange happens server-side, in the
  consuming app, via `@org/dev-auth-core`; by the time Angular code can
  `inject(DevAuth)`, that has already happened and left only a cookie. So
  the two packages are complementary halves of one consumer story (server
  gets the identity, browser reads the resulting session), not a
  client-imports-client chain — which is why `@org/auth`'s own imports never
  need to touch `@org/dev-auth-core`, and the `domain:dev-auth-sdk` rule
  correctly allows both without requiring one to import the other.
- **`libs/shared/ui`** (`@org/ui`) and **`libs/deploy`** (`@org/deploy`) —
  no DevAuth involvement at all. `@org/ui` (badge/button/card/input) is
  generic; `@org/deploy` is DevFlare's own deployment feature code (tagged
  `type:feature`, single consumer), not shared infrastructure despite living
  under a `scope:shared`-adjacent-sounding rule — kept its existing tags,
  given `domain:devflare`.
- **`libs/shared/core`** (`@org/core`) — DevFlare's own tool business logic
  (per `docs/ai/ARCHITECTURE.md`: "Tool services... + auth/projects/
  webcontainer services"). Despite its `scope:shared` tag (a pre-existing,
  unrelated-axis convention this spec did not touch), it is not part of the
  DevAuth ecosystem and was given `domain:devflare`.
- **`apps/devflare`'s four `cloudflare-*.ts` server files** — see §8, the
  Cloudflare OAuth migration map.

## 6. Package naming (Step 5 of the task brief)

`libs/shared/auth` (`@org/auth`) is an ambiguous name in isolation — "auth"
says nothing about _whose_ auth or which layer. Evaluated renaming it (e.g.
to something like `dev-auth-angular`) to match the "Core → Angular → UI"
framing this task describes.

**Decision: keep the current names.** Reasons, in order of weight:

1. **A real, unrelated, unmerged branch already depends on the current
   name.** `feature/012-dev-auth-angular-ui` (open PR #32, "add optional
   DevAuth Angular UI") adds `libs/shared/auth-ui` (`@org/auth-ui`), whose
   own spec (`docs/specs/012-dev-auth-angular-ui.md`, on that branch)
   documents the intended chain as
   `@org/dev-auth-core <- @org/auth <- @org/auth-ui`. Renaming `@org/auth`
   now would directly conflict with that in-flight work the moment it
   rebases or merges — exactly the kind of cross-contamination this task
   was asked to avoid (see §9). This alone is decisive.
2. Renaming would touch `apps/devflare/src/app/{app.config.ts, pages/login.page.ts,
pages/(app).page.ts, pages/(app)/settings.page.ts, components/navbar.component.ts}`
   plus `tsconfig.base.json` and the library's own directory — real,
   non-trivial churn for a name that is understandable in context (it sits
   next to `dev-auth-core` in the same `libs/shared/` directory, and its
   README already explains the split).
3. The ambiguity is resolved by documentation instead (§4's table + this
   file), which is what the task brief explicitly allows ("if current names
   are retained, document exactly what each owns").

`libs/shared/dev-auth-core` (`@org/dev-auth-core`) has an unambiguous name
already and was not a candidate for renaming.

**Follow-up, not done here**: when PR #32 merges, add `domain:dev-auth-sdk`
to `libs/shared/auth-ui/project.json`'s tags. No other change is needed —
the `depConstraints` rule already governs any project carrying that tag, so
this is a one-line addition, not a new decision.

## 7. Cloudflare Connect boundary (Step 7)

`apps/cloudflare-connect` now exists as an intentionally non-functional
scaffold: `GET /health`, an `Env` contract with nothing in it yet, Nx
build/serve/deploy/lint/typecheck/test targets mirroring `apps/dev-auth`'s
shape, a `wrangler.toml` with no bindings, and a README covering
responsibility / non-responsibilities / dependencies / deployment model /
data ownership / security ownership / consumer examples. No
`libs/cloudflare-connect/core` was created — there is no protocol code to
extract into one yet (see §8); creating an empty library now would be
scaffolding ahead of any real content. The `domain:cloudflare-connect`
`depConstraints` rule already exists (§4) so that when real protocol code
does move into such a library, the boundary is enforced from the first
commit rather than retrofitted.

## 8. Migration map: DevFlare's existing Cloudflare OAuth code

`apps/devflare/src/server/lib/`, audited file by file:

| File                                     | Classification                                                               | Notes                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cloudflare-oauth.ts` (393 lines)        | **Cloudflare Connect candidate — protocol layer.**                           | Talks to Cloudflare's _own_ OAuth server (`dash.cloudflare.com/oauth2/{auth,token,revoke}`), scope catalog, PKCE. No `h3` import, no DB import — the cleanest extraction candidate as-is. Currently imports generic PKCE primitives from `@org/dev-auth-core` (see the asterisk below) and `cloudflare.ts` (next row) for request plumbing/error types.                            |
| `cloudflare.ts` (generic API client)     | **Mixed — API plumbing is generic; config resolution is DevFlare-specific.** | `cfRequest`/`API_BASE`/`CloudflareApiError` are generic Cloudflare REST helpers. `resolveCloudflareConfig`/`isCloudflareConfigured` assume **one account per install** (a single resolved config, not a per-user grant) — that single-tenant assumption is DevFlare's own current product shape and would need redesign for Cloudflare Connect's multi-tenant grant model.         |
| `cloudflare-oauth-client.ts` (225 lines) | **DevFlare persistence/integration — needs redesign before extraction.**     | Resolves _which_ Cloudflare OAuth client (id/secret) to use: DB row (`../db`, DevFlare's own D1) first, environment fallback. One global row (`ROW_ID = 'default'`) per install, sealed via DevFlare's own `secret-box.ts`. Cloudflare Connect's eventual model is per-grant, not one row per install.                                                                             |
| `cloudflare-connection.ts` (373 lines)   | **DevFlare persistence/integration — needs redesign before extraction.**     | The actual stored grant (access/refresh token, one row per install, same `ROW_ID = 'default'` pattern). This _is_ the future Cloudflare Connect grant store in spirit, but today it is DevFlare's own D1 table, admin-managed, singular — exactly the "one shared install-wide credential" model Cloudflare Connect's product framing (per-user delegated grants) moves away from. |

**Not moved in this task** — per the task brief, this is a map for a future
migration, not the migration itself.

**Asterisk worth flagging**: `cloudflare-oauth.ts` importing
`@org/dev-auth-core` for `codeChallenge`/`createCodeVerifier`/`createState`
does **not** violate the "DevAuth Identity must not know about Cloudflare"
rule — the dependency direction is Cloudflare code depending on a generic
shared helper, not the reverse, and `dev-auth-core`'s low-level primitives
(`./lib/crypto`, `./lib/protocol`, `./lib/discovery`) are genuinely
RFC-generic, not DevAuth-identity-specific, despite the package name. Still,
once Cloudflare Connect is a real separate deployable, it reading generic
OAuth/PKCE helpers from a package branded `dev-auth-core` is a naming smell
worth resolving then (e.g. splitting the RFC-generic primitives into their
own package that both `dev-auth-core` and Cloudflare Connect depend on).
Not done now: it is real churn (touches `cloudflare-oauth.ts`, `oidc.ts`,
`login.ts`, `callback.ts`, `vite.config.ts`'s `nitro.alias`, and
`dev-auth-core`'s own exports) for a cosmetic concern with no functional
benefit until Cloudflare Connect is an actual second consumer outside this
repo's single Worker. Recorded here so it isn't rediscovered from scratch.

## 9. Protecting concurrent work

Before any change: `git status` (clean, `main`, up to date with origin),
`git log --oneline -15`, `git worktree list` (only this checkout),
`git branch -a`. The working tree itself had no unrelated in-progress
DevFlare work — the image-tool consolidation mentioned in `docs/ai/STATE.md`
turned out to already be merged (PR #34, 2026-09-10T17:28:03Z; see §10).

What **is** genuinely in flight and was deliberately left untouched:
**PR #32** (`feature/012-dev-auth-angular-ui`, open, not merged) implements
exactly the "DevAuth UI" layer this task's brief says not to build —
`DevAuthSignIn`/`DevAuthUserButton` in a new `libs/shared/auth-ui`
(`@org/auth-ui`). Discovered via `git log origin/main..origin/feature/012-...`
and `gh pr list`, not assumed. This directly shaped two decisions above: the
`@org/auth` rename was rejected specifically because that branch depends on
the current name (§6), and no `libs/shared/auth-ui` scaffold was created
here since a real, more complete implementation already exists on that
branch (§7 documents where it will plug into the `domain:dev-auth-sdk`
boundary once merged). This repo's branch was created fresh off `main`
(`feature/dev-auth-modular-architecture`), so PR #32 can merge independently
without conflict from this work.

## 10. STATE.md corrections (Step 17)

`docs/ai/STATE.md`'s own "Branch & repo status" section already flagged
itself as historically unreliable ("STATE drifts from reality between
sessions"). Checked against `git log --oneline -15` and `gh pr list --state
merged`:

- PR #31 (`feat: headless DevAuth consumer SDK...`) **is merged**
  (2026-09-03T18:42:02Z) — STATE's bullet calling it "uncommitted at time of
  writing" was itself already stale by the time it was read.
- PR #33 (consent redirect field fix) **is merged** (2026-09-09T20:36:50Z).
- PR #34 (`feat: remove image api` — the image-tooling-to-Imageryx move)
  **is merged** (2026-09-10T17:28:03Z), not "uncommitted, this repo on
  `feature/remove-duplicate-image-tools`" as STATE said.
- PR #35 (favicons) **is merged** (2026-09-10T18:02:27Z) — not mentioned in
  STATE at all.
- **PR #32** (`feature/012-dev-auth-angular-ui`) is **open, not merged** —
  not mentioned in STATE at all before this update.

STATE.md was rewritten (not appended to) to reflect these facts; see its
"Branch & repo status" section and this session's new "Session log" entry.

## 11. Configuration/security ownership (Steps 10, 14)

| Concern                                                                                                               | Owner today                                                                       | Owner once Cloudflare Connect is real                                         |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`, OIDC signing keys, `OAUTH_CLIENTS`/`OAUTH_CLIENT_SECRETS`, `SECRET_ENCRYPTION_KEY` (dev-auth's) | `apps/dev-auth`                                                                   | unchanged                                                                     |
| Cloudflare OAuth client id/secret, grant encryption key, grant store, callback URL                                    | `apps/devflare` (D1, via `cloudflare-oauth-client.ts`/`cloudflare-connection.ts`) | `apps/cloudflare-connect`, its own D1/secrets, never shared with `dev-auth`'s |

No secrets were migrated in this task. The requirement recorded here is
that Cloudflare infrastructure secrets must never become `dev-auth`'s to
own, and vice versa — separate Worker secrets, separate persistence, so a
compromise of one has a blast radius bounded to what it actually protects
(identity/sessions/SSO vs. authorized Cloudflare resources).

## 12. Consumer composition scenarios (Step 11)

Documented, not implemented — all five remain possible with today's code:

- **Raw OIDC** — an app talks to `dev-auth`'s discovery document directly, no
  SDK. Already true; nothing here changes it.
- **DevAuth Core only** — `@org/dev-auth-core`, framework-agnostic. True
  today (this is exactly what `oidc.ts` does).
- **DevAuth Angular** — `@org/auth` on top. True today.
- **DevAuth UI** — `@org/auth-ui` on top of that. Not merged yet (PR #32);
  architecturally slots into `domain:dev-auth-sdk` once it lands (§6, §9).
- **Cloudflare Connect alone, no DevAuth** — architecturally possible by
  construction: `apps/cloudflare-connect` has and will have no dependency on
  `apps/dev-auth` (enforced by `depConstraints`, §4), so an application can
  use it without ever authenticating through DevAuth.

## 13. Verification

```
npx nx run-many -t lint,typecheck,test --projects=dev-auth,devflare,devflare-e2e,auth,core,dev-auth-core,ui,deploy,cloudflare-connect
```

All 9 projects green (dev-auth: 214+ tests per STATE, unaffected;
devflare: 108 tests; auth: 17; deploy: 65; cloudflare-connect: 2 new smoke
tests). Boundary rule verified live (§4) by a temporary deliberate violation,
then reverted. Full `pnpm format:check && pnpm lint && pnpm typecheck &&
pnpm test && pnpm build` run separately — see `docs/ai/STATE.md` for the
result recorded at the time this shipped.

## 14. Log / Deviations

- 2026-09-11: No `libs/cloudflare-connect/core` created (see §7) — deviates
  from the task brief's "plus potentially libs/cloudflare-connect/core" only
  in that "potentially" resolved to "not yet," for the reason given there.
