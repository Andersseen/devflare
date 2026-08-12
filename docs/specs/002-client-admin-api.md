# 002 — OAuth client admin API + authorization

| Field   | Value                          |
| ------- | ------------------------------ |
| Status  | Draft                          |
| Branch  | `feature/002-client-admin-api` |
| Created | 2026-08-12                     |
| Updated | 2026-08-12                     |

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

- The UI (003). This spec is curl-complete and tested that way.
- Bearer-token / cross-origin access. Cookie + same-origin only (see Decisions).
- User management or promoting admins at runtime.

## 4. Design

### Authorization

No `role` column. Admin is decided by an `ADMIN_EMAILS` var, mirroring the existing
`SIGNUP_ALLOWLIST` pattern: no schema change, no bootstrap chicken-and-egg, and —
the reason it beats a DB column — an attacker who can write the database still
cannot promote themselves to admin.

`requireAdmin` resolves the session via `auth.api.getSession`, then matches
`session.user.email` case-insensitively against the parsed list. An empty or unset
`ADMIN_EMAILS` denies everyone rather than allowing everyone.

### API

New router at `/admin/clients`, outside the blocked `/api/auth/oauth2/*` prefix.
Same-origin only — deliberately **not** added to `DEV_AUTH_CORS_ORIGINS`.
State-changing routes additionally require an `x-devauth-admin: 1` header, which a
cross-site form post cannot set.

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

| File                                                    | Change                                |
| ------------------------------------------------------- | ------------------------------------- |
| `apps/dev-auth/src/lib/admin.ts`                        | new — `ADMIN_EMAILS` + `requireAdmin` |
| `apps/dev-auth/src/routes/admin-clients.ts`             | new — the router above                |
| `apps/dev-auth/src/index.ts`                            | mount it; leave the 404 block intact  |
| `apps/dev-auth/src/db/schema.ts`                        | new `oauthClientAudit` table          |
| `apps/dev-auth/src/db/migrations/0004_client_admin.sql` | new — audit table, additive           |
| `apps/dev-auth/wrangler.toml`                           | `ADMIN_EMAILS` in prod + staging      |

### Decisions & trade-offs

- **Cookie + same-origin, not a bearer scope.** A `clients:manage` scope would let
  DevFlare call this cross-origin, but that means a CORS exception on the most
  sensitive API here to save a click. 003 explains the additive path if it ever
  becomes worth it.
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
- missing `x-devauth-admin` header on a mutation → 403
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

- [ ] 1. `oauthClientAudit` table + migration `0004_client_admin.sql`.
- [ ] 2. `lib/admin.ts` (`ADMIN_EMAILS`, `requireAdmin`) + unit tests.
- [ ] 3. `GET` + `POST /admin/clients` with audit logging + tests.
- [ ] 4. `PATCH`, `DELETE`, `rotate-secret` + tests.
- [ ] 5. Set `ADMIN_EMAILS` in wrangler.toml (prod + staging).
- [ ] 6. Run quality gates (`pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`).
- [ ] 7. Manual verification (section 6).
- [ ] 8. Update `docs/ai/STATE.md` + the index in `docs/specs/README.md`.

## 8. Verification results

_Filled during implementation._

## 9. Log / Deviations

- 2026-08-12 — Drafted. Open question for the owner: should `DELETE` revoke the
  client's outstanding refresh tokens immediately, or leave them to expire? Spec
  assumes immediate revocation.
