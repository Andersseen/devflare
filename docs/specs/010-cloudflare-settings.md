# 010 — Cloudflare account in Settings

| Field   | Value                             |
| ------- | --------------------------------- |
| Status  | In progress                       |
| Branch  | `feature/010-cloudflare-settings` |
| Created | 2026-08-18                        |
| Updated | 2026-08-18                        |

## 1. Summary

Settings → Integrations gets a real Cloudflare section: the state of the account
connection (connect, reconnect, disconnect) and the OAuth client it runs on
(client id + client secret, stored sealed in D1). After this, connecting a
deployment no longer requires `wrangler secret put` for the client secret — only
`SECRET_ENCRYPTION_KEY`, which is what seals it.

## 2. Problem / Motivation

Spec 007 put the whole Cloudflare connection behind `/cloud`, and its OAuth
client behind two environment variables. Two consequences showed up on the live
site:

- Production shows the "paste an API token" prompt because
  `CLOUDFLARE_OAUTH_CLIENT_SECRET` and `SECRET_ENCRYPTION_KEY` were never set on
  the Worker. Nothing in the UI says which of the two is missing — the connect
  button is simply absent.
- Settings is where every other credential in this platform is administered
  (GitHub sign-in, the client registry), so the one credential that is _not_
  there is the one nobody remembers to configure.

The owner also asked for Cloudflare "next to GitHub" in the settings UI. It is
worth stating why that cannot mean a sign-in button: Cloudflare's discovery
document advertises `claims_supported: ["sub"]` — no email, no profile (verified
live 2026-08-18) — so it can authorize API access and can never identify a user.
Sign-in stays dev-auth's, exclusively.

## 3. Goals & Non-goals

**Goals**

- An administrator can see, from Settings, whether the Cloudflare account is
  connected, which account, with which scopes, and since when.
- An administrator can connect, reconnect and disconnect from Settings.
- An administrator can set the OAuth client id and secret from Settings; the
  secret is stored sealed and never sent back to the browser.
- With no stored client, the environment variables keep working exactly as now.
- The UI names what is still missing (`SECRET_ENCRYPTION_KEY`, redirect URI)
  instead of hiding the connect button without explanation.

**Non-goals**

- No "Continue with Cloudflare" sign-in — impossible, see §2.
- Nothing about this goes into dev-auth: it serves other apps, and a Cloudflare
  connection is DevFlare's own (hard rule 9).
- `CLOUDFLARE_OAUTH_REDIRECT_URI` stays environment-only: it is per-deployment,
  it is compared byte for byte against what is registered, and a wrong value
  typed into a form fails after the consent screen rather than before it.
- No per-user connections. One install, one grant, as in spec 007.

## 4. Design

### User flow

Settings → Integrations (administrators only, same verdict as `/cloud`):

1. **Cloudflare account** card — "Connected as Andersseen · 2 hours ago", the
   granted scopes, and a Disconnect button. Not connected: what is missing, and
   either a Connect button or the reason there is none.
2. **OAuth client** card — client id, client secret (write-only), the redirect
   URI this deployment will send so it can be registered, Save, and "Use the
   environment instead" which drops the stored row.

Connect is a top-level navigation to `/api/v1/cloud/connect/start`, exactly as
in `/cloud`; the callback returns to `/cloud?connect=…` as it already does.

### Files to create/modify

| File                                                                                  | Change                                                       |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `apps/devflare/src/server/db/migrations/0004_cloudflare_oauth_client.sql`             | new single-row table                                         |
| `apps/devflare/src/server/lib/cloudflare-oauth-client.ts`                             | new: stored client, D1 → environment resolution              |
| `apps/devflare/src/server/lib/cloudflare-oauth-client.spec.ts`                        | new: resolution order and redaction                          |
| `apps/devflare/src/server/lib/cloudflare-oauth.ts`                                    | `resolveCloudflareOAuthConfig` → `envCloudflareOAuthConfig`  |
| `apps/devflare/src/server/lib/cloudflare-connection.ts`                               | await the async config resolution                            |
| `apps/devflare/src/server/routes/api/v1/cloud/oauth-client/index.{get,put,delete}.ts` | new admin-only endpoints                                     |
| `apps/devflare/src/server/routes/api/v1/cloud/connect/{start.get,callback.get}.ts`    | await the async config resolution                            |
| `libs/shared/core/src/lib/services/cloudflare-account.service.ts`                     | `loadOAuthClient` / `saveOAuthClient` / `clearOAuthClient`   |
| `apps/devflare/src/app/pages/settings/cloudflare-section.ts`                          | new component, both cards                                    |
| `apps/devflare/src/app/pages/settings.page.ts`                                        | Integrations tab renders it in place of the dead placeholder |
| `apps/devflare/wrangler.toml`, `.dev.vars.example`                                    | document that the client may now live in the database        |

### API

All three are admin-gated with `requireCloudAdmin`, like every `/api/v1/cloud/*`
route.

- `GET /api/v1/cloud/oauth-client` answers the client id, its `source`
  (`database`, `environment` or `none`), `secretConfigured`,
  `secretUnreadable`, the `redirectUri` this deployment will send,
  `encryptionKeyConfigured`, and `updatedAt`. Never the secret itself.
- `PUT /api/v1/cloud/oauth-client` — body `{ clientId, clientSecret? }`.
  A blank secret keeps the stored one (as the GitHub card already does); with no
  stored secret and no `SECRET_ENCRYPTION_KEY` it answers 503 rather than
  storing a credential in the clear.
- `DELETE /api/v1/cloud/oauth-client` — forgets the row; the environment
  variables take over again.

### DB

```sql
CREATE TABLE cloudflare_oauth_client (
  id TEXT PRIMARY KEY,      -- always 'default'
  clientId TEXT NOT NULL,
  clientSecret TEXT NOT NULL, -- sealed with SECRET_ENCRYPTION_KEY
  updatedBy TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
```

One row, for the same reason `cloudflare_connection` has one: the grant is
platform-wide.

### Decisions & trade-offs

- **Resolution order is database first, environment second** — the same order
  dev-auth's `provider-settings.ts` uses, and for the same reason: what an
  administrator just typed must win over what was deployed months ago.
- **`resolveCloudflareOAuthConfig` becomes async.** It reads D1 now. Every
  caller was already in an async function, so this costs nothing but the
  `await`s; the pure environment-only reader stays as `envCloudflareOAuthConfig`
  so tests keep a synchronous path.
- **Integrations tab, not Identity.** The Identity tab is a proxy for dev-auth's
  admin API and holds nothing of DevFlare's own; the Cloudflare grant is
  DevFlare's own. The tab is not admin-only in general, so the section renders
  only for administrators — the same verdict `/cloud` asks for.
- **Changing the client id orphans an existing grant** (it was issued to the old
  client and can only be renewed by it). The card says so next to the field
  rather than silently deleting the connection.

## 5. Constraints

- Standalone components, signals, `inject()`, business logic in `@org/core`
  (CONVENTIONS.md).
- `db.sql` tagged templates only.
- No new dependencies.
- Secrets never travel to the browser, not even redacted-but-recoverable.

## 6. Test plan

- Unit: `cloudflare-oauth-client.spec.ts` — a stored row wins over the
  environment; a partial row (no secret) does not silently half-configure; the
  view sent to the browser carries no secret.
- Unit: existing `cloudflare-connection.spec.ts` and `cloudflare-oauth.spec.ts`
  keep passing against the renamed environment reader.
- Manual, local (`pnpm dev:all`, signed in as an admin):
  1. Settings → Integrations shows "not connected" and names the missing pieces.
  2. Save a client id + secret; the card reports `source: database`.
  3. Connect → Cloudflare consent → back on `/cloud?connect=ok`; Settings shows
     the account and scopes.
  4. Disconnect; `/cloud` falls back to the API token if one is set.
  5. "Use the environment instead" restores the deployed values.
- Quality gates: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`.

## 7. Tasks

- [x] 1. Migration + `cloudflare-oauth-client.ts` + spec
- [x] 2. Async config resolution through connection and connect routes
- [x] 3. `/api/v1/cloud/oauth-client` GET/PUT/DELETE
- [x] 4. `@org/core` service methods
- [x] 5. `cloudflare-section.ts` + Integrations tab
- [x] 6. Docs (wrangler.toml comments)
- [x] 7. Quality gates
- [x] 8. Manual verification (section 6)
- [x] 9. Update `docs/ai/STATE.md` + `docs/specs/README.md`

## 8. Verification results

Local, 2026-08-18, `pnpm dev:all`, signed in as `test@devflare.com` (an admin):

- `pnpm format:check`, `pnpm lint`, `pnpm typecheck` clean; `pnpm test` 117
  passed (10 of them new); `nx build devflare` succeeds.
- Settings → Integrations renders both cards. With only the environment
  configured: _"Running on this server's `CLOUDFLARE_API_TOKEN`"_, a Connect
  button, and _"In use: this deployment's environment variables."_
- Saving a client id + secret answered
  `{ source: "database", secretConfigured: true, secretUnreadable: false }` and
  the response carried no secret. The row in local D1 holds
  `oaZuEE/yHrhNdPsj.i…` — sealed, not the plaintext that was typed.
- "Use the environment" returned the view to `source: "environment"` and left
  `/api/v1/cloud/status` at `canConnect: true, configured: true, kind: "token"`.
- `GET /api/v1/cloud/connect/start` still answers a redirect to Cloudflare
  (`type: "opaqueredirect"`), so the async client resolution reaches the
  authorization endpoint.
- `/cloud` still lists the account's 15 Workers — the refactor did not disturb
  the credential every other Cloud route runs on.

Not verified: the consent screen itself (it needs the owner's Cloudflare login,
and approving a grant is not something to do on their behalf), and the non-admin
view (needs a second account).

## 9. Log / Deviations

- 2026-08-18 — Local sign-in was broken before any of this could be verified:
  the development `DEV_AUTH_CLIENT_ID` in `apps/devflare/wrangler.toml` held the
  Cloudflare OAuth client id (`5246101a…`) instead of `devflare-dev`, so
  dev-auth answered every authorization with a bounce back to its login page.
  Fixed in the same branch, in its own commit — it is a paste from spec 007, not
  part of this design.
- 2026-08-18 — Written after the owner asked for Cloudflare "next to GitHub" in
  the settings UI and for production to be connected. Confirmed against the live
  discovery document that Cloudflare cannot be a sign-in provider here; the card
  is about authorization only.
