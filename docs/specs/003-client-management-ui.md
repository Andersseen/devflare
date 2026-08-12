# 003 — OAuth client management UI

| Field   | Value                              |
| ------- | ---------------------------------- |
| Status  | Draft                              |
| Branch  | `feature/003-client-management-ui` |
| Created | 2026-08-12                         |
| Updated | 2026-08-12                         |

Depends on **002 — OAuth client admin API**, which depends on **001**. Do not start
until 002 is Done.

## 1. Summary

The screens for managing OAuth clients: a list, a create form, an edit form and a
secret-rotation flow, served by dev-auth itself at `/admin/clients`, with an entry
point from DevFlare's settings page.

## 2. Problem / Motivation

Spec 002 makes the registry writable but leaves it curl-only. The point of the
exercise is to stop hand-editing configuration, which needs actual screens.

They live in dev-auth rather than inside DevFlare for two reasons. The admin API
is session-cookie authenticated on dev-auth's origin, so same-origin pages need no
CORS hole and no cross-app admin token. And AGENTS.md hard rule 9 says the provider
must not grow DevFlare-specific assumptions — DevFlare consuming an admin API would
make the provider's control plane live inside one of its own clients.

## 3. Goals & Non-goals

**Goals**

- List every client, config and runtime, with the config ones visibly read-only and
  unmodifiable.
- Create a client: name, id, type, redirect URIs (repeatable field), consent toggle.
- Edit redirect URIs on a runtime client, add and remove, with the byte-exact
  matching rule stated in the UI.
- Rotate a secret, and show the plaintext exactly once with a copy control and an
  explicit "this will not be shown again" warning.
- Delete a client behind a type-the-client-id confirmation.
- A link from DevFlare settings to the panel.

**Non-goals**

- Embedding the panel inside DevFlare's Angular app (see Decisions).
- User management, session browsing, or anything beyond OAuth clients.
- Editing config clients — 001 forbids it at the adapter; the UI only reflects that.

## 4. Design

### User flow

1. Owner opens `/admin/clients` on dev-auth. Not signed in → `/login`. Signed in but
   not in `ADMIN_EMAILS` → a 403 page, not a redirect loop.
2. The list shows id, name, type, redirect URIs, source badge (`config` / `managed`).
   Config rows have no action buttons at all.
3. "New client" → form → on submit the secret is shown once on a confirmation
   screen, alongside the exact `OAUTH_CLIENTS`-shaped snippet for reference.
4. Edit → redirect URI rows, add/remove, save. Validation errors come back from the
   API and render inline per URI.
5. Rotate / Delete → confirmation → done.

### Files

| File                                           | Change                               |
| ---------------------------------------------- | ------------------------------------ |
| `apps/dev-auth/src/pages/admin-clients.flow`   | new — list + forms (source of truth) |
| `apps/dev-auth/src/pages/admin-clients.ts`     | new — render fn, mirrors `login.ts`  |
| `apps/dev-auth/src/pages/admin-secret.flow`    | new — one-time secret screen         |
| `apps/dev-auth/src/pages/admin-secret.ts`      | new — render fn                      |
| `apps/dev-auth/src/pages/layout.ts`            | nav entry, admin-only                |
| `apps/dev-auth/src/index.ts`                   | `GET /admin/clients` page routes     |
| `apps/devflare/src/app/pages/settings.page.ts` | card linking out to the panel        |

`.flow` files are compiled with `pnpm --filter @devflare/dev-auth build:flow`; the
generated `.flow.js` is never edited by hand (AGENTS.md hard rule 1).

### Decisions & trade-offs

- **Panel in dev-auth, link from DevFlare.** DevFlare is the day-to-day tool, so the
  pull to embed this natively is real — but doing it now means a cross-origin admin
  token and a CORS exception on the most sensitive API in the system, to save one
  click. 002's API is deliberately generic, so if it is worth embedding later the
  path is additive: an OAuth scope (`clients:manage`), bearer auth alongside the
  cookie, and DevFlare's origin allowed. Nothing in 001–003 blocks that.
- **Server-rendered flow pages, not an SPA.** Matches every other dev-auth page and
  keeps the admin surface free of a build-time JS dependency.
- **Secret shown once, never retrievable.** Storage is hashed (001); a "show secret"
  feature would be impossible to honour without weakening that.

## 5. Constraints

- Standalone Angular, signals, `inject()` for the DevFlare settings change
  (CONVENTIONS.md); the card is presentational, so no `@org/core` service needed.
- Edit `.flow`, never `.flow.js`.
- The panel must never be reachable by a non-admin, including by direct URL.

## 6. Test plan

Unit (`src/__tests__/app.spec.ts`, extended): `/admin/clients` anonymous → 302
`/login`; signed-in non-admin → 403; admin → 200 containing the client list.

Manual, local:

1. Sign in as an admin, create a client through the form, copy the secret.
2. Complete a full authorization + token exchange with that client — no redeploy.
3. Add a second redirect URI in the edit form; confirm both work byte-for-byte.
4. Confirm `devflare` shows as `config` with no edit or delete control, and that a
   direct `PATCH` to it is still refused.
5. Sign in as a non-admin (temporarily widen `SIGNUP_ALLOWLIST`) → 403 on the panel.
6. Follow the DevFlare settings link and land on the panel signed in.

## 7. Tasks

- [ ] 1. `admin-clients.flow` + render fn: read-only list with source badges.
- [ ] 2. Create form + one-time secret screen.
- [ ] 3. Edit form (redirect URIs add/remove) with inline API validation errors.
- [ ] 4. Rotate + delete, both behind confirmation.
- [ ] 5. Admin-only nav entry in `layout.ts`.
- [ ] 6. DevFlare settings card linking to the panel.
- [ ] 7. Run quality gates (`pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`).
- [ ] 8. Manual verification (section 6).
- [ ] 9. Update `docs/ai/STATE.md` + the index in `docs/specs/README.md`.

## 8. Verification results

_Filled during implementation._

## 9. Log / Deviations

- 2026-08-12 — Drafted alongside 001. Open question for the owner: should the list
  show each client's last-used timestamp? It needs a write on every authorization,
  which is a cost on the hot path — left out for now.
