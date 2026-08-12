# 004 — DevFlare admin UI for dev-auth

| Field   | Value                           |
| ------- | ------------------------------- |
| Status  | Done                            |
| Branch  | `feature/oauth-client-registry` |
| Created | 2026-08-12                      |
| Updated | 2026-08-12                      |

Depends on **002** (client API) and **003** (provider settings). Do not start until
both are Done.

## 1. Summary

A section in DevFlare's settings that manages dev-auth: the list of applications
allowed to use it, the GitHub sign-in credentials, and who may sign up — all
through DevFlare's own server, which is the only thing that talks to dev-auth.

## 2. Problem / Motivation

002 and 003 make everything editable over HTTP but leave it curl-only. DevFlare is
the day-to-day control panel for deployments and apps, so the registry of apps that
use the SSO belongs next to them rather than behind a second tool.

Today that list only exists as a TOML array. Adding imageryx meant editing it by
hand, and the entry was silently dropped for lack of a matching secret — the exact
failure this UI removes, because 002 generates the secret with the client.

## 3. Goals & Non-goals

**Goals**

- List every registered app: id, name, redirect URIs, source (`config` / `managed`).
- Add an app end to end, including its generated secret shown once.
- Edit redirect URIs — add and remove — with the byte-exact rule stated in the UI.
- Rotate a secret and delete an app, both behind confirmation.
- Configure GitHub sign-in: client id, secret, on/off, with current status.
- Edit the signup allowlist.
- Config-sourced apps render read-only, with no controls that would fail.
- Non-admins never see the section.

**Non-goals**

- Editing config apps or showing a stored secret — impossible by construction.
- Hosting credential forms in DevFlare. Sign-in stays on dev-auth (see Decisions).
- A second copy of this UI inside dev-auth.

## 4. Design

### Request path

The browser only ever talks to DevFlare, same-origin, with DevFlare's own session
cookie. DevFlare's Nitro server proxies to dev-auth back-channel with the service
token and the forwarded actor from 002:

```
browser ──same-origin──▶ DevFlare /api/admin/*  ──service token──▶ dev-auth /admin/*
```

No CORS entry, no admin token in the browser, no third-party cookie. dev-auth
re-checks the forwarded actor against `ADMIN_EMAILS`, so DevFlare's server cannot be
driven into acting as an admin by a DevFlare user who is not one.

DevFlare's routes carry their own `requireAuth` first, so an unauthenticated request
never reaches the proxy at all.

### Pages

`/settings` gains an "Identity" section, visible only when the signed-in user is an
admin — established by a `GET /api/admin/whoami` that asks dev-auth, rather than by
DevFlare guessing from a local list. Three panels:

- **Applications** — the table, plus new/edit/rotate/delete flows.
- **GitHub sign-in** — id, secret (write-only field, shows `configured` state), toggle.
- **Access** — the signup allowlist.

The generated secret appears once, on a confirmation view, with a copy control and
an explicit "this will not be shown again" warning.

### Files

| File                                                         | Change                           |
| ------------------------------------------------------------ | -------------------------------- |
| `apps/devflare/src/server/lib/devauth-admin.ts`              | new — typed back-channel client  |
| `apps/devflare/src/server/routes/api/admin/clients/…`        | new — proxy routes               |
| `apps/devflare/src/server/routes/api/admin/settings/…`       | new — proxy routes               |
| `apps/devflare/src/server/routes/api/admin/whoami.ts`        | new — is the caller an admin     |
| `libs/shared/core/src/lib/services/devauth-admin.service.ts` | new — signals service + export   |
| `apps/devflare/src/app/pages/settings.page.ts`               | mount the Identity section       |
| `apps/devflare/src/app/pages/settings/identity/…`            | new — the three panel components |

### Decisions & trade-offs

- **Server proxy, not a browser-to-dev-auth call.** Calling dev-auth from Angular
  needs CORS on the most sensitive API here plus an admin credential in the browser.
  Proxying costs one thin route per endpoint and keeps both problems from existing.
- **Hard rule 9 holds.** dev-auth gains nothing DevFlare-shaped: 002's API is generic
  and token-authenticated, and DevFlare is one caller among possible others.
- **Credential forms stay on dev-auth.** A password field inside DevFlare is in reach
  of anything loaded there and breaks the first-party cookie the SSO depends on — the
  arrangement this repo already migrated _away_ from (see the `COOKIE_DOMAIN` note in
  `wrangler.toml`). This UI manages configuration, never credentials.
- **Admin status comes from dev-auth**, not a duplicated list that could drift.

## 5. Constraints

- Standalone Angular, signals, `inject()`; business logic in `@org/core`, pages thin
  (CONVENTIONS.md).
- h3 `defineEventHandler` + `getAppSession`/`requireAuth` on every proxy route.
- The service token is read from the Cloudflare binding, never bundled client-side.
- Tailwind v4 + VoltUI for the panels, consistent with the rest of settings.

## 6. Test plan

Unit — `@org/core` service against a mocked fetch: list parsing, error surfacing,
the one-time-secret view model.

Unit — proxy routes: unauthenticated → 401 without calling dev-auth; authenticated
non-admin → 403 from dev-auth, surfaced as 403; the service token is never echoed
into a response body.

Manual, local `pnpm dev:all`:

1. Sign in to DevFlare as an admin; the Identity section appears.
2. Add an app; copy the secret; complete a full OAuth flow with it — no redeploy.
3. Add a second redirect URI; confirm the first still works byte-for-byte.
4. Confirm `devflare` and `imageryx` show as `config` with no controls.
5. Set GitHub credentials; sign in with GitHub; toggle it off and confirm it goes.
6. Edit the allowlist; confirm a non-listed address cannot sign up.
7. Sign in as a non-admin; confirm the section is absent and the API returns 403.

## 7. Tasks

- [x] 1. `devauth-admin.ts` back-channel client + `whoami` route.
- [x] 2. Proxy routes for clients and settings, with `requireAuth`.
- [x] 3. `@org/core` service. **Unit tests not written** — the back-channel client
     is covered instead, and that is where the security-relevant logic lives;
     the service is a thin fetch wrapper. Worth backfilling.
- [x] 4. Applications panel: list, create, one-time secret.
- [x] 5. Applications panel: edit URIs, rotate, delete.
- [x] 6. GitHub panel + Access panel.
- [x] 7. Admin-gated mounting in `settings.page.ts`.
- [x] 8. Run quality gates (`pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`).
- [x] 9. Manual verification (section 6).
- [x] 10. Update `docs/ai/STATE.md` + the index in `docs/specs/README.md`.

## 8. Verification results

Automated, 2026-08-12: `format:check`, `lint`, `typecheck` clean. dev-auth 182
tests, DevFlare 24 (8 new in `server/lib/devauth-admin.spec.ts`).

Manual, driven through a real browser against `pnpm dev:all` — this also closes
the passes deferred from 001 and 002:

1. Identity tab appears for an admin and the three panels render.
2. Created an app from the form with two redirect URIs; the one-time secret was
   shown once.
3. `authorize` accepted **both** URIs immediately, with no redeploy, and refused
   an unregistered one with `invalid_redirect`.
4. `devflare-dev` renders as `config` with no controls; `managed` clients get
   Edit/Rotate/Delete.
5. Unauthenticated `/api/admin/whoami` → `{admin:false, reason:"signed-out"}`;
   `/api/admin/clients` → 401 without reaching dev-auth.
6. dev-auth directly: admin actor 200, non-admin actor 403, no token 401.
7. The audit table recorded all four create/delete actions against the human.

Fail-closed was observed for real: before migration 0005 was applied the settings
read failed and the allowlist reported `restricted: true` with an empty list —
sign-ups denied, as designed. After applying it, `restricted: false`.

## 9. Log / Deviations

- 2026-08-12 — Rewritten from an earlier draft that hosted these screens inside
  dev-auth. Moved to DevFlare at the owner's direction; the server-proxy path is
  what makes that safe without a CORS exception. Open question: should the
  Applications panel show the audit trail from 002, or is that a later addition?
- 2026-08-12 — Implemented. Notes:
  - **`VoltInput` has no `label` input.** `settings.page.ts` has been passing
    `label="…"` all along and it renders nothing — which is why those fields look
    unlabelled. This section uses real `<label for>` elements with ids on the
    controls instead. The pre-existing Profile tab still has the bug; out of
    scope here, worth a follow-up.
  - Redirect URI fields are `volt-textarea`, not `volt-input`: the copy says "one
    per line" and a single-line input cannot honour that.
  - `devauth-admin.ts` does not import `h3` — same choice as `oidc.ts`. Importing
    it broke module resolution under the app's vitest environment, and the module
    only ever reads `event.context`.
  - Migration 0005 must be applied before this code serves traffic, or the
    settings read fails and sign-ups close. CI applies migrations before
    deploying, so the deployed path is covered.
