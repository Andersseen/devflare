# 007 — Connect the Cloudflare account with OAuth

| Field   | Value                                  |
| ------- | -------------------------------------- |
| Status  | In progress                            |
| Branch  | `feature/007-cloudflare-oauth-connect` |
| Created | 2026-08-17                             |
| Updated | 2026-08-17                             |

## 1. Summary

The Cloud section stops asking for a hand-made API token. An administrator
presses "Connect with Cloudflare", consents on `dash.cloudflare.com`, and
DevFlare stores the resulting OAuth tokens in its own D1, refreshing them as
they expire. The existing `CLOUDFLARE_API_TOKEN` keeps working as a fallback.

## 2. Problem / Motivation

Today `/cloud` is unusable until someone opens the Cloudflare dashboard, creates
a token with five permissions spelled out in the UI, pastes it into `.dev.vars`
or `wrangler secret put`, and restarts the server. That is the single manual
step between a fresh checkout and a working Cloud section, it is the step that
has to be repeated per environment, and it is exactly what STATE.md's next-step
1 is still unsure about in production ("whether `wrangler secret put` was ever
run is unverified").

Cloudflare shipped self-managed OAuth clients on 2026-06-03 (GA), so an app can
now ask the account owner for scoped access the way GitHub or Stripe would. The
token stops being a long-lived string in a secret store and becomes a 15-minute
credential DevFlare renews itself and the owner can revoke from the dashboard.

## 3. Goals & Non-goals

**Goals**

- An admin can connect and disconnect the account from `/cloud` without leaving
  the app or touching a config file.
- Access and refresh tokens are stored encrypted in D1, never sent to the browser.
- An expired access token is refreshed transparently mid-request.
- Everything already built on `CloudflareConfig` (spec 005 read pages, spec 006
  direct upload) keeps working unchanged.
- `CLOUDFLARE_API_TOKEN` still works when no OAuth connection exists.

**Non-goals**

- Per-user connections. The Cloud section is admin-only and platform-wide, so
  there is one connection per install (`id = 'default'`), matching the single
  token it replaces.
- An account picker. If the consent covers several accounts DevFlare takes the
  one named by `CLOUDFLARE_ACCOUNT_ID`, else the first one, and records the rest
  for a later spec.
- Making dev-auth aware of any of this. dev-auth serves more than DevFlare
  (hard rule 9); Cloudflare's OAuth is API authorization, not identity — its
  discovery advertises `claims_supported: ["sub"]` and no email, so it could not
  be a login provider even if we wanted one.

## 4. Design

### User flow

1. Admin opens `/cloud` with nothing configured → gate shows **Connect with
   Cloudflare** (plus the old manual instructions, demoted to a details block).
2. The button is a plain link to `GET /api/v1/cloud/connect/start`, which mints
   `state` + PKCE verifier into a short-lived cookie and redirects to
   `https://dash.cloudflare.com/oauth2/auth`.
3. Cloudflare shows the consent screen with the requested scopes and lets the
   owner choose which account(s) to grant.
4. The redirect lands on `GET /api/v1/cloud/connect/callback`, which verifies
   `state`, exchanges the code back-channel (PKCE + `client_secret_post`),
   resolves the account id, seals the tokens and writes the single row.
5. Redirect to `/cloud`, which now renders normally. The gate's connected state
   shows the account and a **Disconnect** button
   (`DELETE /api/v1/cloud/connect`) that revokes upstream and drops the row.

### Endpoints (from `dash.cloudflare.com/.well-known/openid-configuration`)

| Purpose   | URL                                         |
| --------- | ------------------------------------------- |
| authorize | `https://dash.cloudflare.com/oauth2/auth`   |
| token     | `https://dash.cloudflare.com/oauth2/token`  |
| revoke    | `https://dash.cloudflare.com/oauth2/revoke` |

`code_challenge_methods_supported` includes `S256`;
`token_endpoint_auth_methods_supported` includes `client_secret_post`, which is
what this uses. Access tokens live 900s and come with a `refresh_token` when
`offline_access` is requested.

### Scopes

`offline_access` (refresh), `memberships.read` (resolve the account), and the
read/write scopes matching the token permissions the UI asks for today:
`page.read`, `page.write`, `workers-scripts.read`, `d1.read`,
`workers-kv-storage.read`, `workers-r2.read`. All verified against
`GET /client/v4/oauth/scopes`.

### Files

| File                                                                    | Change                                                        |
| ----------------------------------------------------------------------- | ------------------------------------------------------------- |
| `apps/devflare/src/server/db/migrations/0003_cloudflare_connection.sql` | new table                                                     |
| `apps/devflare/src/server/lib/secret-box.ts`                            | new — AES-GCM seal/open (sibling of dev-auth's)               |
| `apps/devflare/src/server/lib/cloudflare-oauth.ts`                      | new — pure protocol: config, PKCE, exchange, refresh, revoke  |
| `apps/devflare/src/server/lib/cloudflare-connection.ts`                 | new — D1 store, refresh-on-read, credential resolution        |
| `apps/devflare/src/server/routes/api/v1/cloud/connect/start.get.ts`     | new — begins the flow                                         |
| `apps/devflare/src/server/routes/api/v1/cloud/connect/callback.get.ts`  | new — completes it                                            |
| `apps/devflare/src/server/routes/api/v1/cloud/connect/index.delete.ts`  | new — disconnect                                              |
| `apps/devflare/src/server/lib/cloud-admin.ts`                           | `withCloudflare` awaits the async resolver                    |
| `apps/devflare/src/server/routes/api/v1/cloud/status.ts`                | reports how it is connected, and whether OAuth is available   |
| `libs/shared/core/src/lib/services/cloudflare-account.service.ts`       | `CloudStatus` gains `connection`/`canConnect`; `disconnect()` |
| `apps/devflare/src/app/pages/cloud/cloud-gate.ts`                       | connect button; manual token instructions demoted             |
| `apps/devflare/wrangler.toml`                                           | documents the two new config values                           |

### DB

```sql
CREATE TABLE cloudflare_connection (
  id TEXT PRIMARY KEY,       -- always 'default'
  accountId TEXT NOT NULL,
  accountName TEXT,
  scope TEXT NOT NULL,
  accessToken TEXT NOT NULL, -- sealed
  refreshToken TEXT,         -- sealed
  expiresAt TEXT NOT NULL,
  connectedBy TEXT NOT NULL,
  connectedAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
```

### Configuration

`CLOUDFLARE_OAUTH_CLIENT_ID` + `CLOUDFLARE_OAUTH_REDIRECT_URI` are vars;
`CLOUDFLARE_OAUTH_CLIENT_SECRET` and `SECRET_ENCRYPTION_KEY` are secrets. With
none of them set nothing changes: the gate shows today's manual instructions.

### Decisions & trade-offs

- **Tokens in D1, encrypted, not in a Worker secret.** A secret cannot be
  rewritten from inside a request, and a refresh token that cannot be persisted
  is useless. Same trade-off dev-auth already accepted for the GitHub secret: a
  database dump plus `SECRET_ENCRYPTION_KEY` reveals the token.
- **Refresh serialized per isolate.** Cloudflare rotates refresh tokens, so two
  concurrent refreshes would burn the token and kill the connection. One
  in-flight promise per isolate, plus a 120s early-refresh margin.
- **`invalid_grant` marks the row stale, it does not delete it.** The admin sees
  "reconnect" rather than a Cloud section that silently reverts to the env token
  with different permissions.
- **New lib files are not named `cloud*.ts` after a route directory.** A
  `lib/<name>.ts` colliding with `routes/api/v1/<name>/` fails to resolve under
  the Nitro dev server only (see the header of `lib/project-rows.ts`).

## 5. Constraints

`docs/ai/CONVENTIONS.md` throughout: h3 `defineEventHandler`, `db.sql` tagged
templates, signals in the UI, no new dependencies (Web Crypto only). Protocol
code stays framework-free and unit-testable, like `lib/oidc.ts`. No credential
may reach the browser or a log.

## 6. Test plan

- Unit (`cloudflare-oauth.spec.ts`): authorization URL carries the scopes,
  `S256` challenge and state; the exchange posts `client_secret_post` form
  fields; refresh maps the response; account resolution prefers the configured
  id; errors never carry the secret.
- Unit (`cloudflare-connection.spec.ts`): the pure half — expiry margin, row →
  connection mapping, "needs reconnect" verdict.
- Manual, once the OAuth client exists: `/cloud` → Connect → consent → back on
  `/cloud` with workers and Pages listed; `SELECT` the row and confirm the
  tokens are sealed; wait past 900s and reload to prove the refresh; Disconnect
  and confirm the gate returns and the grant is gone from the dashboard.

## 7. Tasks

- [x] 1. Migration `0003_cloudflare_connection.sql`.
- [x] 2. `lib/secret-box.ts`.
- [x] 3. `lib/cloudflare-oauth.ts` + spec.
- [x] 4. `lib/cloudflare-connection.ts` + spec.
- [x] 5. Routes: start, callback, disconnect.
- [x] 6. `cloud-admin.ts` + `status.ts` wiring.
- [x] 7. `@org/core` status shape + disconnect.
- [x] 8. `cloud-gate.ts` connect UI.
- [x] 9. `wrangler.toml` + docs for the new config.
- [x] 10. Quality gates (`format:check`, `lint`, `typecheck`, `test`).
- [ ] 11. Manual verification (section 6) — **blocked**: needs the OAuth client
      created in the dashboard and its client id/secret configured.
- [ ] 12. Update `docs/ai/STATE.md` + the index in `docs/specs/README.md`.

## 8. Verification results

Automated gates, 2026-08-17: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`
and `pnpm test` all pass. The devflare suite is 8 files / 100 tests, of which 32
are new (23 in `cloudflare-oauth.spec.ts`, 9 in `cloudflare-connection.spec.ts`).

`pnpm nx build devflare` succeeds and the three routes are registered as
expected — from the built manifest: `/api/v1/cloud/connect/start` (get),
`/api/v1/cloud/connect/callback` (get), `/api/v1/cloud/connect` (delete).
Migration 0003 applied cleanly to the local D1.

Endpoints and scopes were read from the live service rather than assumed:
`dash.cloudflare.com/.well-known/openid-configuration` for the four endpoints,
`S256`, and `client_secret_post`; `GET /client/v4/oauth/scopes` (383 scopes) for
every scope id in `CF_OAUTH_SCOPES`.

Not verified: anything that needs a real consent screen. No OAuth client existed
when this was written, so the authorize redirect, the code exchange, the refresh
and the revoke have never run against Cloudflare.

## 9. Log / Deviations

- **2026-08-17** — Client auth method settled from the live discovery document
  rather than guessed: `client_secret_post` is advertised, so the secret goes in
  the form body like `lib/oidc.ts` already does with dev-auth.
- **2026-08-17** — Open question for verification: whether Cloudflare accepts an
  `http://localhost` redirect URI. If it does not, local testing needs a tunnel
  and only the production redirect can be registered.
- **2026-08-17** — The token response reportedly carries a `resource` field.
  Parsed defensively as an account hint; account resolution does not depend on
  it (`/accounts`, then `CLOUDFLARE_ACCOUNT_ID`, then the first account).
- **2026-08-17** — The client can also be registered with
  `POST /accounts/{id}/oauth_clients` instead of by hand — see
  `scripts/create-cloudflare-oauth-client.sh`. It needs an API token with
  `OAuth Clients Write`; the Cloud section's own token does not have it and must
  not gain it, since that permission can mint clients against the whole account.
- **2026-08-17** — `CLOUDFLARE_OAUTH_CLIENT_ID` is left commented out in
  `wrangler.toml` until the client exists. Setting it early would make the UI
  offer a flow that dead-ends on Cloudflare's consent screen.
