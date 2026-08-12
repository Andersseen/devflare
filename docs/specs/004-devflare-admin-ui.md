# 004 — DevFlare admin UI for dev-auth

| Field   | Value                           |
| ------- | ------------------------------- |
| Status  | Draft                           |
| Branch  | `feature/004-devflare-admin-ui` |
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

- [ ] 1. `devauth-admin.ts` back-channel client + `whoami` route.
- [ ] 2. Proxy routes for clients and settings, with `requireAuth`.
- [ ] 3. `@org/core` service + unit tests.
- [ ] 4. Applications panel: list, create, one-time secret.
- [ ] 5. Applications panel: edit URIs, rotate, delete.
- [ ] 6. GitHub panel + Access panel.
- [ ] 7. Admin-gated mounting in `settings.page.ts`.
- [ ] 8. Run quality gates (`pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`).
- [ ] 9. Manual verification (section 6).
- [ ] 10. Update `docs/ai/STATE.md` + the index in `docs/specs/README.md`.

## 8. Verification results

_Filled during implementation._

## 9. Log / Deviations

- 2026-08-12 — Rewritten from an earlier draft that hosted these screens inside
  dev-auth. Moved to DevFlare at the owner's direction; the server-proxy path is
  what makes that safe without a CORS exception. Open question: should the
  Applications panel show the audit trail from 002, or is that a later addition?
