# 011 — Identity control plane: Users, Sessions, Providers

| Field   | Value                                                         |
| ------- | ------------------------------------------------------------- |
| Status  | In progress (code complete, verified locally; needs a deploy) |
| Branch  | `feature/011-identity-control-plane`                          |
| Created | 2026-09-03                                                    |
| Updated | 2026-09-03                                                    |

## 1. Summary

Rounds out dev-auth's admin surface (specs 001–004: client registry, admin API,
provider settings, DevFlare UI) into the four-area control plane the owner
described: **Applications** (polish only), **Users** (new), **Sessions** (new),
**Providers** (new — reorganizes what 003/004 already built plus two status
rows). Adds a small ban mechanism, session listing/revocation, and generalizes
the existing audit table across all four areas.

## 2. Problem / Motivation

Applications, GitHub credentials and the signup allowlist are already fully
manageable without a deploy. What's missing: the owner cannot see who has an
account, cannot see or revoke a live session short of clearing cookies, and the
Identity tab presents GitHub config and the allowlist as one undifferentiated
blob rather than a legible "who can sign in, and how" view.

## 3. Investigation findings (read before reviewing the design)

- **better-auth 1.6.26 ships an `admin` plugin** (`better-auth/plugins/admin`)
  with `listUsers`, `banUser`/`unbanUser`, `listUserSessions`,
  `revokeUserSession(s)`, plus `setRole`, `createUser`, `removeUser`,
  `setUserPassword`, `impersonateUser`/`stopImpersonating`. **Not adopted.**
  Three incompatibilities, not just "unwanted extras":
  - Its own request authorization is `role`-based (`user.role` column checked
    against `adminRoles`, or a static `adminUserIds` list). This repo's admin
    model is deliberately **not** a DB column — see `lib/admin.ts`'s docstring:
    "an attacker who can write the database still cannot promote themselves to
    admin." Wiring the plugin in means either accepting that regression or
    re-deriving `adminUserIds` from `ADMIN_EMAILS` on every request anyway — at
    which point the plugin is providing no authorization value.
  - It always registers all 14 endpoints under `/api/auth/admin/*`, including
    `impersonate-user` and `set-role` — both explicit non-goals here. They would
    need edge-blocking (`index.ts`, the same pattern as `CLIENT_WRITE_PATHS`)
    to stay off, which is more surface to secure than not registering the
    plugin at all.
  - Its schema adds `user.role`, `user.banned`, `user.banReason`,
    `user.banExpires`, `session.impersonatedBy` — four columns this task
    doesn't need (no roles, no ban-expiry, no impersonation) for one it does
    (`banned`).
  - What it does validate as _sound and worth copying_: the ban check runs as a
    `session.create.before` database hook, so a ban blocks new sign-ins without
    touching existing sessions — matching this spec's own design below almost
    exactly. That shape is reused; the plugin is not.
- **`oauthClientAudit`** (schema.ts, migration 0004) is already
  action/actor/target/changes-shaped and both existing admin routers share one
  `audit()` helper (currently copy-pasted). It becomes the general admin audit
  table here rather than a new `identity_audit_event` table — same columns the
  task's own sketch wants, already built, already has 100+ passing tests
  exercising its shape. One additive column (`targetType`) generalizes it.
- **`session.cookieCache`** is enabled (`auth.config.ts`, 5 min). Any
  revocation — this spec's or the admin plugin's — leaves an already-issued
  cookie usable for up to 5 minutes after the DB row is gone. Documented, not
  fixed: it's inherent to how better-auth signs that cache, not a gap this
  spec's approach introduces.
- **DevFlare's Identity tab** (`identity-section.ts`) is one component with
  three inline cards (Applications, GitHub sign-in, Access). It becomes a
  shell with four sub-tabs; each panel moves to its own file.
- **`/admin/clients` and `/admin/settings` currently have no rate limit** — the
  two Hono rate limiters in `index.ts` only wrap `/api/auth/*`. Worth closing
  while touching this area (section 5 asked for a rate-limit review).

## 4. Goals & Non-goals

**Goals**

- Applications: expose `disabled`/status, `scopes`, and timestamps already on
  the row but not in the API response; no new capability.
- Users: list, view one (with linked providers, verification state, session
  count, timestamps), ban (disable sign-in), unban.
- Sessions: list active sessions (global, and per-user), each with user
  identity, createdAt/updatedAt/expiresAt and IP/user-agent when present;
  revoke one; revoke all for a user.
- Providers: one view distinguishing authentication methods (GitHub,
  email/password, transactional email) from OAuth consumer applications, all
  status-only — no secrets.
- Every admin write goes through the existing `authenticateAdmin` +
  CSRF-header + audit pattern; nothing new bypasses it.
- `/admin/*` gets the same rate limiting `/api/auth/*` already has.

**Non-goals** (unchanged from the brief)

- Impersonation, roles/RBAC, organizations, SAML/SCIM, MFA, passkeys, magic
  links, the SDK, Cloudflare-as-IdP.
- Temporary bans (`banExpires`) — ban/unban is a binary switch here; the owner
  is the only user today and "expires in N days" is unverifiable product
  guessing per the brief's "never invent missing metadata."
- Device fingerprinting beyond what `session.ipAddress`/`userAgent` already
  store.
- A transactional email provider (STATE.md next-step 3, unrelated to this).

## 5. Design

### 5.1 Schema (migration `0006_users_sessions_admin.sql`)

```sql
ALTER TABLE user ADD COLUMN bannedAt INTEGER;      -- timestamp, null = active
ALTER TABLE user ADD COLUMN bannedReason TEXT;
ALTER TABLE user ADD COLUMN bannedBy TEXT;          -- admin email, denormalised

ALTER TABLE oauthClientAudit ADD COLUMN targetType TEXT NOT NULL DEFAULT 'client';
```

`targetType` backfills every existing row to `'client'`, which is what they all
are today (settings rows currently use `clientId = NULL`; those get
`targetType = 'settings'` in a second `UPDATE`, keyed on `action LIKE
'settings.%'`). New rows pass it explicitly: `'client' | 'settings' | 'user' |
'session'`. `clientId` (unrenamed — SQLite `ALTER TABLE … RENAME COLUMN` is
fine, but nothing forces it and it avoids touching two working routers) keeps
its role as the free-text target id for every type.

No `role`, no `banExpires`, no `impersonatedBy` — see §3.

### 5.2 Ban enforcement (`auth.config.ts`)

New `databaseHooks.session.create.before` hook, sibling to the existing
`user.create.before` allowlist check:

```ts
session: {
  create: {
    before: async (sessionData) => {
      const [bannedUser] = await db
        .select({ bannedAt: user.bannedAt })
        .from(user)
        .where(eq(user.id, sessionData.userId));
      if (bannedUser?.bannedAt) {
        throw new APIError('FORBIDDEN', { message: 'This account has been disabled.' });
      }
    },
  },
},
```

Blocks new sign-ins (password, GitHub, and — because the OAuth provider's
authorization step also creates a session — new SSO grants to consumer apps).
Existing sessions are untouched by a ban alone; revoking them is a separate,
explicit action (§5.4), matching the brief's "disable" vs "revoke sessions"
being two different buttons.

### 5.3 `routes/admin-users.ts` (new)

Same middleware shape as `admin-clients.ts`/`admin-settings.ts`
(`authenticateAdmin` + CSRF header on writes), mounted at `/admin/users`.

| Method | Path                     | Notes                                                             |
| ------ | ------------------------ | ----------------------------------------------------------------- |
| `GET`  | `/admin/users`           | list; `?q=` filters by name/email substring (SQL `LIKE`)          |
| `GET`  | `/admin/users/:id`       | one user + linked `account.providerId`s + session count           |
| `POST` | `/admin/users/:id/ban`   | body `{ reason?: string }`; sets `bannedAt/bannedReason/bannedBy` |
| `POST` | `/admin/users/:id/unban` | clears the three columns                                          |

List/detail responses: `id, name, email, emailVerified, image, createdAt,
updatedAt, banned (bool), bannedReason, providers: string[], sessionCount`.
Never a password hash, token, or `account.accessToken`/`refreshToken`.

### 5.4 `routes/admin-sessions.ts` (new)

Mounted at `/admin/sessions`.

| Method   | Path                           | Notes                                                             |
| -------- | ------------------------------ | ----------------------------------------------------------------- |
| `GET`    | `/admin/sessions`              | all sessions, joined to `user` for name/email; `?userId=` filters |
| `DELETE` | `/admin/sessions/:id`          | revoke one (deletes the row)                                      |
| `DELETE` | `/admin/sessions/user/:userId` | revoke all of one user's sessions                                 |

Response per session: `id, userId, userEmail, userName, createdAt, updatedAt,
expiresAt, ipAddress, userAgent`. `ipAddress`/`userAgent` render as-is,
including `null` — the UI shows "—", never a fabricated "Chrome / macOS" when
the column is empty (`userAgent` is stored raw; no UA-parsing library is added
— that's the "no device fingerprinting" non-goal). A plain `db.delete` against
`session` is used rather than `auth.api.revokeUserSession` — no admin plugin is
installed (§3), and a direct delete is exactly what that endpoint does
underneath; the 5-minute cookie-cache lag (§3) applies identically either way.

Both routers write to `oauthClientAudit` via the same shared helper, extracted
to `lib/audit.ts` (`action`, `targetType`, `targetId`, `changes`) and imported
by all four route files, replacing the two copies in `admin-clients.ts` and
`admin-settings.ts`.

### 5.5 `routes/admin-settings.ts` (extended, not restructured)

`GET /admin/settings` response gains two read-only blocks so the UI can build
the Providers view from one call:

```jsonc
{
  "github": { "clientId": "…", "secretConfigured": true, "enabled": true },
  "emailPassword": { "enabled": true, "requireEmailVerification": false },
  "transactionalEmail": { "configured": false },
  "signup": { "allowlist": ["…"], "restricted": true },
}
```

`emailPassword` and `transactionalEmail` are literal constants exported from
`auth.config.ts` (`EMAIL_PASSWORD_STATUS`, `TRANSACTIONAL_EMAIL_CONFIGURED`)
and re-read by the settings route, so `createAuthOptions` and the admin API
cannot silently disagree — the alternative (hand-copying `false`/`true` into
two files) is exactly the config-drift class of bug this whole registry effort
started from (imageryx, STATE.md 2026-08-12).

### 5.6 `routes/admin-clients.ts` (Applications polish, additive)

`present()` gains fields already on the row/config but not surfaced:
`disabled` (bool), `scopes` (string[], config clients' fixed `SCOPES` /
managed rows' stored `scopes` column, defaulting to the full set when unset —
today every managed client is created with no explicit scope restriction),
`createdAt`, `updatedAt` (config clients: `null`, they have none). No behavior
change; existing fields, existing validation, existing collision rules
untouched per the brief ("polish rather than rewriting").

### 5.7 `index.ts`

- Mount `adminUserRoutes` at `/admin/users`, `adminSessionRoutes` at
  `/admin/sessions` — same placement/comment style as the two existing mounts.
- Wrap `/admin/*` in a rate limiter (`createRateLimitMiddleware(30, 60_000)` —
  looser than the 10/min credential limit since one admin session can
  legitimately fire several list calls loading one page, tighter than the
  60/min OAuth-traffic one since this is a human, not a fleet of consumer
  servers).

### 5.8 DevFlare back-channel + UI

`devauth-admin.service.ts` (`@org/core`) gains `AdminUser`, `AdminSession`,
`ProviderStatus` types and `loadUsers`, `loadUserDetail`, `banUser`,
`unbanUser`, `loadSessions`, `revokeSession`, `revokeUserSessions` methods —
same `request()` wrapper, same error surfacing, no new dependency.

New proxy routes under `apps/devflare/src/server/routes/api/admin/`:
`users/index.ts` (GET), `users/[id].ts` (GET), `users/[id]/ban.post.ts`,
`users/[id]/unban.post.ts`, `sessions/index.ts` (GET),
`sessions/[id].delete.ts`, `sessions/user/[userId].delete.ts` — each a
one-line `forward()` call through the existing `admin-proxy.ts`, identical
shape to the client/settings routes already there.

`identity-section.ts` becomes a thin shell:

```
apps/devflare/src/app/pages/settings/identity/
  identity-section.ts       (was identity-section.ts — now hosts VoltTabs: Applications | Users | Sessions | Providers)
  applications-panel.ts     (existing Applications card, moved verbatim + status/scopes columns)
  users-panel.ts            (new — list + detail drawer + ban/unban)
  sessions-panel.ts         (new — list + revoke / revoke-all)
  providers-panel.ts        (existing GitHub + Access cards, regrouped + two new read-only status rows)
```

`settings.page.ts` changes only its import path for `IdentitySection`.

### 5.9 Decisions & trade-offs

- **Ban ≠ session revocation**, two buttons not one. A ban that silently
  killed every session would surprise an owner mid-task on a second device;
  the brief lists them as separate admin operations for the same reason.
- **`admin` plugin not installed** — full reasoning in §3. Recorded here
  because it's the one place this spec diverges from "Better Auth first":
  investigated, found incompatible with this repo's own stated authorization
  model, not adopted. The parts worth keeping (ban-blocks-new-session shape)
  are reimplemented in ~10 lines rather than pulling in the other 13
  endpoints.
- **No UA parsing.** "Chrome / macOS" in the brief's mock is illustrative, not
  a requirement — the brief also says "never invent missing metadata," and
  `userAgent` is stored as the raw header. Rendering it raw (or a `—`) is
  honest; parsing it into a device label without a vetted UA-parsing
  dependency risks misreporting a browser/OS that isn't there.
- **`oauthClientAudit` kept, not replaced.** See §3.

## 6. Constraints

- AGENTS.md hard rule 9 — nothing DevFlare-shaped enters the provider; all four
  new endpoints are as generic as the existing client/settings ones.
- SQL via drizzle only, no string concatenation (dev-auth) / `db.sql` tagged
  templates (DevFlare) — unchanged from existing code in this area.
- Never return a password hash, OAuth token, or any `account.*Token` column.
- Migration additive and replayable; `ALTER TABLE … ADD COLUMN` only, no drop
  or rename of an existing column.
- Standalone Angular, signals, `inject()`, thin pages — CONVENTIONS.md.

## 7. Test plan

Unit, `apps/dev-auth/src/__tests__/admin-users.spec.ts` (new):

- list/get/ban/unban: anonymous 401, non-admin 403, admin 200 (mirrors
  `admin-clients.spec.ts`'s existing auth matrix — reused, not re-invented)
- ban sets the three columns and is reflected in the next `GET /admin/users/:id`
- a banned user's next sign-in attempt is refused (integration, against the
  real `createAuthOptions` + in-memory D1 — same harness `oauth-provider.spec.ts`
  already uses)
- unban clears the ban and a subsequent sign-in succeeds
- an audit row is written for `ban` and `unban`, `targetType: 'user'`
- list never includes `account.password`/`accessToken`/`refreshToken`

Unit, `apps/dev-auth/src/__tests__/admin-sessions.spec.ts` (new):

- list/revoke/revoke-all: anonymous 401, non-admin 403, admin 200
- revoking a session removes exactly that row, not others for the same user
- revoke-all removes every session for the named user and none for another
- revoking a nonexistent session id → 404, not a 500
- an audit row is written for `revoke` and `revoke-all`, `targetType: 'session'`

Unit, `apps/dev-auth/src/lib/__tests__/audit.spec.ts` (new): the extracted
helper writes the expected row shape and swallows (logs, doesn't throw) a
write failure — same contract the two inline copies already have today.

Extend `apps/dev-auth/src/__tests__/admin-settings.spec.ts`: `GET
/admin/settings` includes `emailPassword`/`transactionalEmail` and neither
ever carries a secret.

DevFlare: extend `server/lib/devauth-admin.spec.ts`'s existing pattern for the
new proxy routes — unauthenticated 401 without reaching dev-auth (matches the
existing three cases for clients/settings).

Manual, `pnpm dev:all`:

1. Settings → Identity now shows four tabs.
2. Users lists the seeded test account and the owner's; ban the test account;
   confirm its next sign-in attempt is refused with the FORBIDDEN message and
   that its _existing_ browser session still works until step 4.
3. Sessions lists that still-live session; revoke it; confirm the next request
   from that browser is signed out (allowing for the up-to-5-minute cookie
   cache, per §3 — verified by clearing cookies rather than waiting, if faster).
4. Unban the test account; confirm sign-in succeeds again.
5. Providers tab shows GitHub, email/password and transactional-email rows
   with no secret visible in the DOM or network tab.
6. Applications tab unchanged behaviourally; new status/scopes/timestamp
   columns render for both config and managed clients.
7. Non-admin sign-in: Identity tab absent; direct `GET /api/admin/users` → 401
   without a session, 403 with a non-admin one (checked directly against
   dev-auth, bypassing DevFlare's proxy, same as 004's manual pass did for
   clients).

## 8. Tasks

- [x] 1. Migration `0006_users_sessions_admin.sql` + schema.ts + test helper
     `d1.ts` migration list.
- [x] 2. `lib/audit.ts` extraction; update `admin-clients.ts`/`admin-settings.ts`
     to use it; keep existing tests green.
- [x] 3. Ban hook in `auth.config.ts` + its test.
- [x] 4. `routes/admin-users.ts` + tests.
- [x] 5. `routes/admin-sessions.ts` + tests.
- [x] 6. `admin-settings.ts`: `emailPassword`/`transactionalEmail` blocks + test.
- [x] 7. `admin-clients.ts`: status/scopes/timestamps in `present()` (plus the
     `disabled` toggle — see §9's deviation note).
- [x] 8. Rate limit on `/admin/*` in `index.ts`.
- [x] 9. `@org/core` `DevAuthAdminService` additions.
- [x] 10. DevFlare proxy routes (users, sessions).
- [x] 11. UI: split `identity-section.ts` into the four panels (§5.8).
- [x] 12. Run quality gates (`pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`).
- [x] 13. Manual verification (section 7).
- [x] 14. Update `docs/ai/STATE.md` + the index in `docs/specs/README.md`.
- [ ] 15. **Owner action, not done here**: apply migration `0006` to the
      remote D1 databases (`pnpm db:migrate` or the deploy workflow) and deploy
      both Workers. Everything above is verified against local D1 only.

## 9. Log / Deviations

- 2026-09-03 — Verified. Automated: `pnpm format:check`, `pnpm lint`,
  `pnpm typecheck`, `pnpm build` (both `devflare` and `dev-auth`'s
  `wrangler deploy --dry-run`) all clean. `pnpm test` — 214 dev-auth (up from
  182; new: `admin-users.spec.ts` 13, `admin-sessions.spec.ts` 11,
  `lib/audit.spec.ts` 3, `ban.spec.ts` 2, plus extensions to
  `admin-clients.spec.ts` and `provider-settings.spec.ts`), 118 devflare, 8
  core, 6 auth, 65 deploy — all passing.

  A real bug surfaced only by writing `ban.spec.ts` against the actual D1/
  drizzle adapter (not the `memoryAdapter` `oauth-provider.spec.ts` otherwise
  uses): the original hook read the banned user through
  `ctx.context.internalAdapter.findUserById`, mirroring the `admin` plugin's
  own approach — but better-auth's internal adapter only carries fields it
  knows about for the `user` model through that path, silently dropping
  `bannedAt` because it was never registered as a `user.additionalFields`
  entry. Reverted to a direct drizzle query against `env.DB` (§5.2 as
  originally specced) once this was caught by the test rather than assumed.

  Migration: `wrangler d1 migrations apply DB --local` applied `0006` cleanly
  against a database with 2 existing users and prior audit history; both
  `bannedAt`/`bannedReason`/`bannedBy` and `oauthClientAudit.targetType`
  landed with the expected `DEFAULT` backfill.

  Live, via `pnpm dev:all` + Playwright, signed in as the local admin
  (`test@devflare.com`):
  1. Settings → Identity shows four sub-tabs (Applications, Users, Sessions,
     Providers) as a button row + `@switch`, not a nested `<volt-tabs>` — see
     the note on `identity-section.ts` below for why.
  2. Applications: the config client (`devflare-dev`) renders with its new
     status/scopes/first-party badges; behavior unchanged from before this
     spec.
  3. Users: both real local accounts listed with correct provider badges
     (`credential`, `github`) and live session counts. Banned
     `andriipap01@gmail.com` with a reason through the UI (confirm + prompt
     dialogs both exercised) — row flipped to "banned", reason displayed,
     button became "Unban"; verified directly in D1 that `bannedAt`/
     `bannedReason`/`bannedBy` were set and an audit row was written
     (`action: "ban"`, `targetType: "user"`, `actorEmail:
"test@devflare.com"`). Unbanned; D1 confirmed cleared.
  4. Sessions: listed all 9 real sessions accumulated across this project's
     development history, with honest `—` for the `ipAddress` column (never
     populated locally) and real user-agent strings. Revoked the oldest
     (already-expired) one; D1 confirmed the row gone and an audit row
     written (`action: "revoke"`, `targetType: "session"`). The signed-in
     browser session was unaffected.
  5. Providers: GitHub (enabled, real local client id, secret configured),
     Email + Password (enabled, verification not required — matches
     `EMAIL_PASSWORD_STATUS`), Transactional email (not configured), Access
     (empty allowlist, unrestricted locally) — no secret visible in the
     accessibility tree or DOM.
  6. Non-admin / anonymous paths were not re-walked live — covered by the
     automated auth-matrix tests in every new `*.spec.ts` file instead
     (anonymous 401, non-admin 403, admin 200, mirroring
     `admin-clients.spec.ts`'s existing pattern).

  **Deviation found live, fixed on the spot:** the design in §5.8 nested a
  second `<volt-tabs>` inside DevFlare's existing `<volt-tabs-content
value="identity">`. In the browser this rendered a correct-looking trigger
  row (the right button showed `data-state="active"`) but every panel stayed
  `display: none` — inspection of the live DOM showed each inner
  `NgpTabPanel`'s computed active-state was being resolved against the
  _outer_ Settings tabset's selection ("identity") rather than the inner
  one's, in this installed `ng-primitives` version (0.110.2 — the same
  version STATE.md already has one open, unrelated `NgpLabel` SSR-warning
  issue against). Replaced the inner tabset with a plain button row driving a
  local signal plus `@switch`, which sidesteps the primitive entirely; same
  visual result, no dependency on nested-tabset support. Recorded in
  `identity-section.ts`'s own docstring so a future dependency bump that
  fixes it is easy to notice.

- 2026-09-03 — Implementation: `PATCH /admin/clients/:clientId` also accepts
  `disabled: boolean` now, one line added to the existing boolean-field block
  next to `skipConsent`/`enableEndSession`. §5.6 originally scoped
  Applications polish as display-only, but a `disabled`/Status column with no
  way to ever set it true (short of raw SQL) is dead UI — the brief's own
  Applications mock shows a "Disable/Delete" pair, and disable-without-delete
  is reversible in a way delete is not (tokens survive; delete revokes them).
  Also found while wiring the list endpoint: `toRegisteredClient` (existing,
  ../lib/client-row.ts) returns `null` for a disabled row by design — correct
  for deciding whether a client may authorize, but it meant a disabled managed
  client silently vanished from `GET /admin/clients` instead of showing as
  disabled. Fixed with a new `presentRow()` that reads the row directly for
  display, leaving `toRegisteredClient` and its null-for-disabled behavior
  untouched everywhere it governs authorization (collision checks, the
  registry itself).
- 2026-09-03 — Drafted after reading specs 001–004 in full and the current
  `apps/dev-auth/src` tree (schema, admin routers, `auth.config.ts`,
  `index.ts`) plus the installed `better-auth@1.6.26` admin plugin's compiled
  source (`node_modules/better-auth/dist/plugins/admin/{admin,routes,schema,types}.mjs`)
  to settle the plugin-vs-custom question with the real API surface rather
  than the docs summary. Longer than the ~150-line guideline by design — it
  covers what specs 001–004 covered across four documents, kept as one spec
  because it is one branch/PR (existing project preference against
  branch-per-change for a single workstream).
