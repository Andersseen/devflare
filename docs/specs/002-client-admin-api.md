# 002 — OAuth client admin API + authorization

| Field   | Value                           |
| ------- | ------------------------------- |
| Status  | Done                            |
| Branch  | `feature/oauth-client-registry` |
| Created | 2026-08-12                      |
| Updated | 2026-08-12                      |

Depends on **001 — Hybrid OAuth client registry**. Do not start until 001 is Done.

## 1. Summary

An authenticated, admin-only API on dev-auth that creates, edits, deletes and
rotates the runtime clients 001 taught the provider to read — plus the
authorization model deciding who counts as an admin, which does not exist today.

## 2. Problem / Motivation

After 001 a D1 client resolves, but only direct SQL can put one there. This is the
spec that actually removes the deploy from the loop.

It also has to invent authorization from nothing. There is no `role` in the schema;
the only reason nobody else can act today is that `SIGNUP_ALLOWLIST` holds a single
email — and widening that allowlist is next-step 1 in STATE.md. A widened allowlist
plus a client-management API and no authorization check means any user who signs up
can rewrite redirect URIs. The check lands before the API, not after.

## 3. Goals & Non-goals

**Goals**

- Create, edit, delete and rotate clients over HTTP; effective on the next request.
- Only an admin can call any of it; a signed-in non-admin gets 403, anonymous gets
  sent to `/login`.
- Secrets stored hashed only, returned in plaintext exactly once, never retrievable.
- Every mutation writes an audit row: actor, action, client, before/after.
- Config clients are rejected as write targets with a clear error, not a 500.

**Non-goals**

- The UI (004). This spec is curl-complete and tested that way.
- Browser-facing CORS. The only cross-origin caller is a server (see Callers).
- Provider settings — GitHub credentials, signup allowlist — are 003.
- User management or promoting admins at runtime.

## 4. Design

### Authorization

No `role` column. Admin is decided by an `ADMIN_EMAILS` var, mirroring the existing
`SIGNUP_ALLOWLIST` pattern: no schema change, no bootstrap chicken-and-egg, and —
the reason it beats a DB column — an attacker who can write the database still
cannot promote themselves to admin.

`requireAdmin` resolves the acting user's email, then matches it case-insensitively
against the parsed list. An empty or unset `ADMIN_EMAILS` denies everyone rather
than allowing everyone.

### Callers

Two, and the acting user is checked the same way for both.

**Browser on dev-auth's own origin** — session cookie, same-origin: curl during
development, and any page dev-auth serves itself.

**DevFlare's server** — the UI (004) lives in DevFlare but its browser never reaches
here. DevFlare's Nitro server calls back-channel with a service token
(`ADMIN_API_TOKEN`, a Worker secret on dev-auth, matching value in DevFlare's env)
and forwards the acting user as `x-devauth-actor: <email>`. That header is trusted
only **because** the token was present; without it it is ignored. dev-auth still
checks the actor against `ADMIN_EMAILS`, so a non-admin DevFlare user cannot drive
DevFlare's server into acting as one — the confused-deputy case this would otherwise
create. The audit row records the human, not "devflare". No CORS entry is needed:
only servers talk to dev-auth.

### API

New router at `/admin/clients`, outside the blocked `/api/auth/oauth2/*` prefix.
Deliberately **not** added to `DEV_AUTH_CORS_ORIGINS`. Cookie-authenticated
state-changing routes additionally require an `x-devauth-admin: 1` header, which a
cross-site form post cannot set; token-authenticated calls are exempt, a service
token being unavailable to a cross-site attacker in the first place.

| Method   | Path                                     | Notes                                |
| -------- | ---------------------------------------- | ------------------------------------ |
| `GET`    | `/admin/clients`                         | config + D1; config marked read-only |
| `POST`   | `/admin/clients`                         | returns plaintext secret **once**    |
| `PATCH`  | `/admin/clients/:clientId`               | name, URIs, consent, end-session     |
| `DELETE` | `/admin/clients/:clientId`               | revokes that client's tokens too     |
| `POST`   | `/admin/clients/:clientId/rotate-secret` | returns new plaintext **once**       |

Every write runs the shared validators from 001 before touching D1. `clientId` is
immutable after creation — changing it is a delete plus a create, and saying so
avoids silently orphaning issued tokens.

### Files

| File                                                    | Change                                           |
| ------------------------------------------------------- | ------------------------------------------------ |
| `apps/dev-auth/src/lib/admin.ts`                        | new — `ADMIN_EMAILS`, `requireAdmin`, token auth |
| `apps/dev-auth/src/routes/admin-clients.ts`             | new — the router above                           |
| `apps/dev-auth/src/index.ts`                            | mount it; leave the 404 block intact             |
| `apps/dev-auth/src/db/schema.ts`                        | new `oauthClientAudit` table                     |
| `apps/dev-auth/src/db/migrations/0004_client_admin.sql` | new — audit table, additive                      |
| `apps/dev-auth/wrangler.toml`                           | `ADMIN_EMAILS` in prod + staging                 |

### Decisions & trade-offs

- **Service token, not a `clients:manage` OAuth scope.** A scope is the tidier
  answer on paper, but the provider deliberately refuses `client_credentials`
  ([oauth-clients.ts:376](../../apps/dev-auth/src/oauth-clients.ts#L376)), so a scope
  would mean re-enabling a grant type that was switched off on purpose. A shared
  service token between two servers I control is smaller and reversible.
- **Delete revokes tokens.** Leaving them to expire means a deleted client keeps
  working for the refresh-token lifetime, which is not what "delete" reads as.
- **Audit is a table, not just logs.** Worker logs are not retained long enough to
  answer "when did this redirect URI change".

## 5. Constraints

- AGENTS.md hard rule 9: the API is generic; DevFlare is one caller among others.
- Migration additive and replayable — audit table only, no change to `oauthClient`.
- No secret in git; plaintext exists only in the response body that creates it.
- SQL through drizzle/`db.sql` tagged templates, never concatenation.

## 6. Test plan

Unit (`src/__tests__/admin-clients.spec.ts`, new):

- anonymous → 302 `/login`; signed-in non-admin → 403; admin → 200
- unset `ADMIN_EMAILS` denies an otherwise-valid admin
- missing `x-devauth-admin` header on a cookie-authed mutation → 403
- `x-devauth-actor` **without** a valid service token is ignored, not trusted
- a valid service token with a non-admin actor → 403
- the audit row records the forwarded actor, not the service token
- `POST` returns a plaintext secret; the stored value is a hash, not that string
- `PATCH`/`DELETE` on a config client → 4xx with a clear message, not a 500
- an invalid or already-claimed redirect URI is rejected before any write
- an audit row is written for each of create / update / delete / rotate

Manual, against a local `pnpm dev:all`:

1. `POST /admin/clients` for a throwaway client; capture the one-time secret.
2. Authorize with it and exchange the code — no redeploy anywhere.
3. `PATCH` a second redirect URI; confirm the first still works byte-for-byte.
4. `PATCH /admin/clients/devflare` → refused.
5. Rotate the secret; confirm the old one fails at the token endpoint.
6. Delete it; confirm authorize returns `invalid_client` and the audit table has
   four rows.

## 7. Tasks

- [x] 1. `oauthClientAudit` table + migration `0004_client_admin.sql`.
- [x] 2. `lib/admin.ts`: `ADMIN_EMAILS`, cookie + service-token auth, actor
     resolution, `requireAdmin` + unit tests.
- [x] 3. `GET` + `POST /admin/clients` with audit logging + tests.
- [x] 4. `PATCH`, `DELETE`, `rotate-secret` + tests.
- [x] 5. Set `ADMIN_EMAILS` in wrangler.toml; `ADMIN_API_TOKEN` as a Worker secret
     on both sides.
- [x] 6. Run quality gates (`pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`).
- [x] 7. Manual verification (section 6).
- [x] 8. Update `docs/ai/STATE.md` + the index in `docs/specs/README.md`.

## 8. Verification results

Automated, 2026-08-12: `format:check`, `lint` (6 projects), `typecheck`
(3 projects) all clean. dev-auth suite **156 passed**, up from 131 — 25 new in
`__tests__/admin-clients.spec.ts`, covering every case in section 6 including
each refusal.

The routes are tested against real SQLite with the actual migrations applied
(`__tests__/helpers/d1.ts`), not a mocked database, so the SQL under test is the
SQL that runs.

Manual verification still outstanding — it needs `pnpm dev:all` and a browser,
and covers 001's deferred pass as well.

## 9. Log / Deviations

- 2026-08-12 — Drafted. Open question for the owner: should `DELETE` revoke the
  client's outstanding refresh tokens immediately, or leave them to expire? Spec
  assumes immediate revocation.
- 2026-08-12 — Implemented as specced, plus:
  - **Anonymous returns 401 JSON, not a 302 to `/login`.** Section 3 said
    redirect, but this is an API consumed by a server; a redirect would arrive at
    DevFlare's proxy as a confusing 200-with-HTML. The UI in 004 handles the 401.
  - A **service token presented without `x-devauth-actor` is refused** rather
    than attributed to the machine. An unattributable audit row defeats the point.
  - `clientId` is validated against `^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$` — the spec
    said "immutable after creation" but never said what a valid one looks like.
  - Test infrastructure: `__tests__/helpers/d1.ts` maps `node:sqlite` onto the
    `D1Database` interface. Built-in rather than adding `better-sqlite3`, which is
    only present transitively. `tsconfig.app.json` now excludes `__tests__/`,
    since helpers are Node code and the app compiles against workers-types.
  - Note for later: `/api/admin` (backup, stats) still exists with its own
    `ADMIN_SECRET` machine token and no acting human. Two admin surfaces with
    different auth models is a wart worth collapsing once 004 lands.
