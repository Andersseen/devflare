# STATE — Current status snapshot

> **Load this at the start of every session.** It is the hand-off note between
> work sessions and between agents.
>
> **How to update (mandatory when you finish meaningful work):** rewrite the
> sections below to reflect reality — don't append forever. Keep "Session log"
> to the last ~5 entries, newest first. Update the date. Facts only; no plans
> you didn't verify.

_Last updated: 2026-09-04_

## Branch & repo status

- `main` is `5bfebef`, the merge commit for PR #31. It includes the headless
  `@org/dev-auth-core` SDK, generalized `@org/auth` Angular adapter, and the
  DevFlare dogfood migration from `3ad64dc`. Spec 011 was merged earlier in PR
  #30 (`912f2f6`). Migration `0006` has not been confirmed on remote D1.
- **Spec 012 is complete locally on `feature/012-dev-auth-angular-ui` and is
  uncommitted.** It adds optional `@org/auth-ui` SignIn/UserButton components
  and dogfoods both in DevFlare. `pnpm check`, 17 component tests, 18 auth E2E
  tests across Chromium/Firefox/WebKit, production SSR build, and the full local
  login/callback/menu/logout flow passed. No PR, deployment, provider, server,
  schema, migration, or dependency change was made.
- Production is current: the deploy for PR #23 succeeded at 2026-08-18T05:48Z
  and `wrangler d1 migrations list DB --env production --remote` reports nothing
  pending. Spec 010 adds migration `0004_cloudflare_oauth_client.sql`, which the
  deploy workflow will apply.
- **Spec 010 is verified locally** (Settings → Integrations, save/clear round
  trip, sealed row in D1). Specs 006–009 are still unverified in a browser.
- **Production now has the fallback Cloudflare API token.** On 2026-08-25,
  `CLOUDFLARE_API_TOKEN` was copied from `apps/devflare/.dev.vars` into the
  DevFlare production Worker with `wrangler secret put CLOUDFLARE_API_TOKEN
--env production` (value never printed). `wrangler secret list --env
production` now reports `CLOUDFLARE_API_TOKEN`, `DEV_AUTH_ADMIN_TOKEN` and
  `DEV_AUTH_CLIENT_SECRET`. Production still has no
  `SECRET_ENCRYPTION_KEY`/`CLOUDFLARE_OAUTH_CLIENT_SECRET`, so the interactive
  OAuth connect flow is not configured yet; Cloud pages should run on the
  fallback API token.
- **`quartz-headless` is a new dependency** (spec 009). The app had only
  `@voltui/components`; the splitter behind the resizable sidebar comes from
  Quartz because Volt's own `volt-resizable` keeps no state to persist.

## 2026-08-10 — first real browser walkthrough of prod auth, and what it found

STATE's own "Next steps" from 2026-08-09 said the migrated provider had never
been walked through a browser. It hadn't — and the first real attempt (by the
owner, against `auth-devflare.andersseen.dev`) surfaced a genuine bug that made
**both** GitHub sign-in and email/password sign-in look completely dead in
production, plus a separate local-only "GitHub gives an error" report and a
request to stop DevFlare's dashboard from rendering while signed out.

- **Root cause (fixed):** every `apps/dev-auth/src/pages/*.flow` page renders
  a bare classic `<script>` at the end of `renderLayout`'s body. The custom
  elements it depends on (`and-toast`, `and-input`, …) are registered by a
  `type="module"` script in `<head>` — and module scripts are always deferred,
  running only after the document finishes parsing, regardless of where they
  sit in the document. A classic inline script with no `src` executes
  synchronously the moment the parser reaches it, _before_ that deferred
  module has run — so `document.getElementById('toaster')` returns the raw
  unupgraded element, and `.present` doesn't exist on it yet.
  `login.flow`'s `showCallbackError()` IIFE calls `toaster.present(...)`
  unconditionally at the top of the script whenever the page loads with
  `?error=`, which is exactly what happens on the redirect back from a failed
  `/authorize` call. That call threw an uncaught `TypeError`, which aborted
  the rest of the script **before** `form.addEventListener('submit', …)` and
  `githubBtn.addEventListener('click', …)` ever ran — so neither button did
  anything, indefinitely, because the same script also never got a chance to
  strip `?error=` from the URL, so every reload re-triggered the crash. A
  native (unhandled) form GET submit is also why "sign in with email" visibly
  just reloaded `/login`. Fix: `<script>` → `<script type="module">` in all
  six pages that reference `toaster` (`login`, `signup`, `forgot`, `setup`,
  `consent`, `signed-in`) — module scripts execute in document order relative
  to each other, so by the time these run, the components module has already
  finished its synchronous `customElements.define()` calls. Recompiled via
  `compile-flow.mjs`. Verified end-to-end locally with Playwright against
  `pnpm dev:all`: email sign-in completes and lands back on DevFlare
  authenticated; the GitHub button now correctly POSTs to
  `/api/auth/sign-in/social` and navigates to GitHub (with an empty
  `client_id` locally, since there's no local GitHub OAuth App configured —
  expected, production has real credentials).
- **The local "GitHub gives an error" report was environmental, not a code
  bug:** the terminal in the report ran `nx run devflare:dev` directly, which
  only starts the Analog app (port 4200/5173) — not dev-auth. `pnpm dev:all`
  is what starts both (dev-auth on :8787). Confirmed: with `pnpm dev:all`, the
  full authorization-code round trip (DevFlare → dev-auth → GitHub or
  email/password → back to DevFlare) works locally.
- **Dashboard now requires login.** `apps/devflare/src/app/app.routes.ts`'s
  `''` (home) child route had no guard — the marketing/dashboard page and its
  "Welcome back, {user}" block rendered fully for signed-out visitors. Added
  `canActivate: [authGuard]` (same guard already used by `/deploy`,
  `/projects`, `/settings`). `/tools/*` is a set of sibling top-level routes,
  not a child of `''`, so it is unaffected and stays public. Verified with
  Playwright: signed-out `/` now redirects to `/login`; `/tools` still renders
  without a session; a full sign-in still lands back on `/` authenticated.
- Verified: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`
  all green (125 tests: 103 dev-auth + 16 devflare + 6 auth). Committed,
  merged (PR #15) and deployed 2026-08-10T07:01:21Z.

### The real production root cause: `devflare` was never a registered client

The script-ordering fix above did **not** actually fix production sign-in —
after it shipped, a real browser attempt against `auth-devflare.andersseen.dev`
still dead-ended (GitHub sign-in landed back on dev-auth's own `/` page
instead of DevFlare; email sign-in bounced back to `/login`). The first theory
here — "probably a stale tab replaying a cached `?error=invalid_client`" —
**was wrong**, and so was a second theory tried before this one ("the GitHub
resumption mechanism is fine, the user must have double-clicked" — that was
based on a _local_ trace only and never checked against production).

Caught live with `pnpm cf:tail:auth` while the owner reproduced it once,
cleanly, in production:

```
GET /api/auth/oauth2/authorize?...&client_id=devflare&...
GET /login?error=invalid_client&error_description=client_id+is+required
```

`client_id=devflare` was present on every attempt — the request never made it
past the provider's client lookup. `wrangler secret list --env production`
confirmed why: **`OAUTH_CLIENT_SECRETS` did not exist on the `dev-auth-prod`
Worker, and `DEV_AUTH_CLIENT_SECRET` did not exist on the `devflare` Worker.**
`devflare` is registered as `type: "web"` (confidential) in `OAUTH_CLIENTS`,
and `oauth-clients.ts`'s `parseOAuthClients` silently drops any confidential
client with no matching `OAUTH_CLIENT_SECRETS` entry (by design — see that
file's docstring). So the client was never in the registry, `/oauth2/authorize`
failed the `!client` check (which reuses the same `"client_id is required"`
message as the "no client_id at all" case — misleading, but that's the
plugin's wording, not this repo's), and **every** sign-in attempt, through
either method, failed at the very first hop — before any pending-authorization
context ever existed to resume. This was true from the original provider
migration deploy (2026-08-09) onward, not something this session's fixes
introduced or could have fixed on their own.

Fixed by generating one secret and setting it on both sides (`wrangler secret
put`, additive — neither var existed before):
`OAUTH_CLIENT_SECRETS={"devflare":"…"}` on `dev-auth-prod`,
`DEV_AUTH_CLIENT_SECRET=…` on `devflare`. Verified with a direct `curl` to
`/api/auth/oauth2/authorize?...&client_id=devflare&...`: before the fix, 302
to `/login?error=invalid_client`; after, 302 to `/login?...&sig=…` (a
correctly signed pending-authorization handoff). Rotated once more right
after (the first value had appeared in plaintext in this chat session) — same
verification, same result, second time with the value never printed anywhere
in the transcript (generated into a shell variable, piped straight into
`wrangler secret put`).

While in there: also rotated the long-known-compromised `BETTER_AUTH_SECRET`
(see "Known gaps" below — that gap is now closed) and cleared the `jwks` table
on `dev-auth-db-prod` (`wrangler d1 execute ... --command "DELETE FROM
jwks;"`, 1 row) so a fresh ES256 key pair gets minted encrypted under the new
secret. Verified `/api/auth/jwks` now serves a new `kid` and `/health` still
returns 200.

**Lesson for next time:** local-only reproduction is not sufficient evidence
for a "not a bug" conclusion on a provider/consumer pair that only fails in
one of the two environments — config that lives in Cloudflare secrets
(`wrangler secret list`) is invisible to any amount of source-reading or local
testing and has to be checked directly.

## dev-auth: a standalone OAuth 2.1 / OIDC identity provider

dev-auth is not "DevFlare's auth service". It is an identity provider that any of
the owner's apps — in any repository, on any domain — authenticates against.
DevFlare is one registered client; Imaginaryx is the worked example of a second.

**Migrated to `@better-auth/oauth-provider` (2026-08-09, uncommitted).** The old
`better-auth/plugins/oidc-provider` carries an explicit `@deprecated` in 1.6.26
("will be removed in the next major version"). better-auth went 1.6.11 → 1.6.26
(a patch bump inside the same minor; nothing else was upgraded) and the new
plugin came in at the same version.

- **Provider**: `@better-auth/oauth-provider` + `jwt` in
  `apps/dev-auth/src/auth.config.ts`. Authorization code flow, PKCE mandatory
  (S256 only — `plain` is now rejected at the schema, with a 400 rather than a
  redirect), ES256 tokens, JWKS at `/api/auth/jwks`. New for free with the
  migration: `/oauth2/revoke`, `/oauth2/introspect`, `/oauth2/end-session`
  (opt-in per client), RFC 9207 `iss` on the callback, and
  `/.well-known/oauth-authorization-server`. Both discovery documents are
  server-only inside the plugin, so `src/index.ts` mounts them at the issuer root.
  `createAuthOptions(env, database)` is still split from `createAuth(env)` so
  tests exercise the identical config on an in-memory DB; both are now async
  (the registry hashes client secrets) and memoised per isolate.
- **Client registry**: unchanged in principle, rebuilt underneath.
  `OAUTH_CLIENTS` (a wrangler var, in git: id/name/type/exact redirect URIs) +
  `OAUTH_CLIENT_SECRETS` (a Worker secret). The new plugin has **no in-memory
  `trustedClients` option** — it reads clients through the database adapter — so
  `src/client-registry.ts` wraps the adapter and answers the `oauthClient` model
  from configuration, refusing every write. Consequences: `oauthClient` in D1
  stays empty, no client secret is ever persisted, and deleting a client from
  config deletes it from the provider with no stale row behind it.
- **Client registration is closed by three independent locks**: the routes 404 in
  `src/index.ts`; `clientPrivileges: () => false` in `auth.config.ts` (the plugin
  otherwise only checks for a _session_ before letting `/oauth2/create-client`
  through); and the read-only client store. Any one can be removed without
  opening registration.
- **Schema**: migration `0003_oauth_provider_v2.sql`. `oauthApplication`,
  `oauthAccessToken` and `oauthConsent` are **renamed** to `*_legacy_oidc` (not
  dropped), and the new `oauthClient` / `oauthRefreshToken` / `oauthAccessToken` /
  `oauthConsent` are created. `user`, `session`, `account`, `verification` and
  `jwks` are untouched, so every account, password, linked GitHub identity, live
  session and signing key survives. Old-plugin access/refresh tokens stop being
  redeemable — unavoidable, costs one extra trip through the flow per consumer.
  Verified locally: 0000→0003 applies clean on a fresh miniflare D1, and the
  indexes land on the new tables (an index follows its table through a rename but
  keeps its name, so 0003 drops the three stale names first — without that
  `CREATE INDEX IF NOT EXISTS` would silently no-op).
- **`APP_URL` is gone.** It was the last DevFlare-specific assumption: a direct
  sign-in at dev-auth redirected to DevFlare, so "signed in to the provider"
  silently meant "signed in to DevFlare". `/` is now the provider's own signed-in
  page (identity + sign out, no dashboard) or a redirect to `/login`. Removed
  from `Env`, `wrangler.toml` (all three envs), `.env.example` and both auth
  pages. Authorization requests are unaffected — they return to the initiating
  client's registered redirect URI.
- **Flow resumption changed shape.** The old plugin parked the authorization
  request in an `oidc_login_prompt` cookie; the new one signs it into the login
  page's query string. `login.flow` / `signup.flow` now hand that string back as
  `oauth_query` on sign-in, sign-up and GitHub sign-in. A tampered one is refused.
- **New `/consent` page.** `consentPage` is a required option now. Unreachable
  for every client registered today (all first-party, all `skipConsent`), but
  wired to a real screen so a future non-first-party client fails closed rather
  than at a 404.
- **DevFlare is a consumer**: `src/server/lib/oidc.ts` +
  `routes/api/auth/{login,callback,session,logout,user}.ts`, with its own session
  in `app_session`/`app_user` (migration `0001_app_session.sql`). `app_user.id`
  is the provider's `sub`, so existing `projects.userId` rows still resolve.
  **Untouched by this migration** — it talks standard OAuth and never knew which
  plugin was behind it, which is the point.
- 103 dev-auth tests (41 provider-flow, 28 registry-parsing, 17 routing, 9
  read-only client store, 8 validation), all against the real better-auth
  instance via `createAuthOptions`.

## DevAuth consumer SDK: `@org/dev-auth-core` + `@org/auth`

The first stable headless DevAuth consumer SDK, built by auditing DevFlare's
existing OIDC client code (`server/lib/oidc.ts` was already framework-agnostic
— fetch + Web Crypto only, no h3 import) and extracting the genuinely reusable
protocol pieces rather than inventing a new API. Kept inside the existing
`@org/*` scope rather than a new `@dev-auth/*` npm scope (see the package
README's "Naming" section) — no library in this monorepo has a `package.json`
today, so publication readiness was documented, not built.

- **`libs/shared/dev-auth-core`** (`@org/dev-auth-core`): framework-agnostic
  OAuth 2.1/OIDC client — `createDevAuthClient({issuer, clientId, clientSecret?,
redirectUri, scope?})` returning `.discover()`, `.createAuthorizationRequest()`,
  `.handleCallback()`, `.getUserInfo()`, `.logoutUrl()`. Discovery
  (`.well-known/openid-configuration`) is cached per issuer (10 min), falls back
  to dev-auth's conventional `{issuer}/api/auth/oauth2/*` layout on an
  unreachable/non-200 discovery endpoint (cached 30s, so an outage doesn't
  become a per-request fetch storm), but **throws** on an issuer mismatch —
  that's a spoofing signal, not an outage. Typed errors:
  `AuthorizationDeniedError` (provider `error=`), `InvalidStateError` (missing/
  mismatched state), `ProtocolError` (exchange/userinfo failure), `DiscoveryError`.
  36 tests. Two callers now: DevFlare's dev-auth client (below) and
  `apps/devflare/src/server/lib/cloudflare-oauth.ts` — a completely unrelated
  OAuth client (Cloudflare's own self-managed-OAuth API access, not identity)
  that was already reusing the same PKCE primitives by importing them from
  `oidc.ts`; it now imports them from here instead, which is what surfaced this
  as a real second consumer rather than a hypothetical one.
- **`libs/shared/auth`** (`@org/auth`) **generalized, not duplicated**: this
  library already _was_ the Angular consumer-session facade the task asked for
  (`user()`/`loading()`/`isAuthenticated()`/`signIn()`/`logout()` plus a route
  guard) — it just talked to a hardcoded `/api/auth` base path. Renamed
  `Auth`→`DevAuth`, `loading`→`isLoading`, `signIn`→`login` to match the
  requested signals-first API; added `provideDevAuth({basePath?})` (an
  `InjectionToken`, default `/api/auth`) so a future second consumer app isn't
  locked to that path. It does not and should not speak OAuth/OIDC — by the
  time Angular code can `inject(DevAuth)`, the server-side flow has already run
  and left behind only that app's own session cookie. Guards are documented as
  UX only, not a security boundary. Deleted a dead `@org/core` re-export shim
  (`export { Auth } from '@org/auth'`) that nothing imported. 17 tests (was 6).
- **DevFlare dogfoods it**: `server/lib/oidc.ts` shrank to just
  `resolveOidcConfig` (env/Cloudflare-binding reading — deliberately kept out
  of the SDK, since discovery/PKCE/state/exchange/userinfo/`safeReturnTo` are
  now `@org/dev-auth-core` re-exports) plus `getDevAuthClient(context)`.
  `routes/api/auth/login.ts` and `callback.ts` rewritten against
  `createAuthorizationRequest()`/`handleCallback()`, with the exact same
  external behavior and `/login?error=...` redirects as before (verified live,
  see below) — `oidc.spec.ts` keeps testing what's still actually local to this
  app (`resolveOidcConfig`); the protocol-level assertions moved to
  `dev-auth-core`'s own spec files rather than staying stale in two places.
- **One real integration trap, fixed**: Nitro's server bundle (the h3 routes,
  built separately from the client/SSR Vite build) does **not** inherit
  `nxViteTsPaths()` — no server route had ever imported an `@org/*` lib before,
  so this was invisible until now. Needed an explicit entry in
  `apps/devflare/vite.config.ts`'s `nitro.alias`, the same mechanism already
  used there for `colorthief`/`papaparse`. Anything else under `libs/shared/`
  that a future server route wants to import will hit the same wall.
- **Verified live** (`pnpm dev:all` + Playwright, 2026-09-03): logged out of
  DevFlare → `/login` → "Continue with DevAuth" → dev-auth (already had its own
  session + `devflare-dev` is `skipConsent`, so no credentials screen this
  round) → `/api/auth/callback` → new DevFlare session → authenticated
  dashboard showing "Test User" → logged out again, navbar back to "Sign In".
  Also drove both callback error paths directly: `?error=access_denied` →
  `/login?error=access_denied` renders "Sign-in was cancelled."; a bogus
  `?code=&state=` with no transaction cookie → `/login?error=invalid_state`.
  Did not additionally force dev-auth's own credentials screen (its session
  cookie from earlier testing was still live) — the code path that renders it
  is unchanged from before this migration.
- **`pnpm check` (format/lint/typecheck/test/build) is green**, `dev-auth`
  build unaffected (nothing there changed).
- **Not done, by explicit task scope**: no visual auth components, no
  Imageryx/Ally migration (DevFlare is the only dogfood consumer), no npm
  publication, no ID-token verification (identity comes from one userinfo
  call), no React/Vue/Astro or Analog-specific server adapters.

## Hosting: Cloudflare Workers (deployed 2026-08-07)

The app and the auth service each run as a Cloudflare Worker, deployed from
`main` by `.github/workflows/deploy.yml`.

**Provisioned 2026-07-28** (account `c32a93ee83fe9b5d53c63fcc73b90bb9`):

| Resource | Name                          | ID                                     |
| -------- | ----------------------------- | -------------------------------------- |
| D1       | `devflare-db`                 | `399d5c02-d2b0-4537-9899-b28771b2c645` |
| D1       | `dev-auth-db-prod`            | `6028a3b7-c545-46fb-aba2-b8b444d2dce0` |
| D1       | `dev-auth-db-staging`         | `fccd953b-0780-40d5-80b1-e9444c01cfe7` |
| KV       | `dev-auth-rate-limit-prod`    | `2a96a69362c9460fbf1dc6715ab0ed38`     |
| KV       | `dev-auth-rate-limit-staging` | `38f688fba9d1466ea801902f36dbe2d2`     |

Migrations are already applied to all three D1 databases (remote).

Target domains: app `devflare.andersseen.dev`, auth
`auth-devflare.andersseen.dev`. They no longer need a shared parent domain: the
apps authenticate over OAuth and hold their own sessions, so no cookie is shared.

Key decisions and the traps behind them:

- Nitro preset `cloudflare-module`. **`compatibilityDate` in
  `apps/devflare/vite.config.ts` is load-bearing:** Nitro filters dev presets by
  it, `cloudflare-dev` requires ≥ 2025-07-15, and Analog hardcodes 2024-11-19.
  Lower it and local dev silently loses all bindings — every D1 query fails with
  "binding `DB` not found" while the build still passes.
- **Not** using `cloudflare.deployConfig`. It makes Nitro emit a merged config
  plus a `.wrangler/deploy/config.json` redirect, and wrangler refuses
  redirected configs that declare environments. `apps/devflare/wrangler.toml`
  therefore owns `main` and `[assets]` itself.
- App DB is D1 via db0's `cloudflare-d1` connector. The binding resolves lazily
  from `globalThis.__env__`, which Nitro sets both in production and (via
  `getPlatformProxy`) in dev — so one code path covers both and the route
  handlers needed no changes. `initDatabase()` DDL-at-import is gone; schema is
  in `apps/devflare/src/server/db/migrations/`.
- `src/server/lib/oidc.ts` reads its config from the Cloudflare binding first and
  only falls back to `process.env`, rather than trusting the unenv shim. (This
  was `auth-remote.ts` before the provider rework.)
- Browser-only tool deps cannot enter the Worker bundle. `colorthief` is aliased
  to its ESM build (the Node build reaches `sharp`); `papaparse` has no usable
  build (CJS + Blob-worker breaks Rollup's CJS transform) so it is aliased to
  `apps/devflare/shims/papaparse.server.mjs`, which throws if SSR ever calls it.
- `better-sqlite3` and the tracked, empty `data/devflare.db` are removed.

## UI shell (merged)

Reworked the shell so the VoltUI adoption keeps the pre-VoltUI look:

- **Root cause of the visual regression:** `apps/devflare/src/styles.css` never
  imported `@voltui/components/themes.css`. That file carries the
  `@source '../fesm2022'` directive Tailwind v4 needs to scan the compiled
  component bundle — without it Tailwind skips `node_modules` and purges every
  utility used _inside_ Volt templates. `md:relative`, `w-72`, `bg-surface` and
  `text-foreground` were all absent from the built CSS, so the sidebar stayed
  `position: fixed` with no width and overlapped the main content.
- The import also supplies tokens the app never defined
  (`--surface-foreground`, `--scrollbar-thumb`, `--color-foreground`). The app's
  own slate/indigo palette is declared after it and still wins.
- Volt keys `dark:` off a `.dark` class; this app is driven by
  `prefers-color-scheme`. `styles.css` redeclares the `dark` variant to accept
  both so the existing `dark:` utilities keep working.
- New `components/shell-navigation.ts` is the single source of truth for the
  navbar sections, sidebar groups and the tool catalog.
- New `components/navbar.component.ts` (logo, Deployment/DevTools tabs, auth
  actions); the sidebar now renders only the active section's groups instead of
  one flat 14-item list.
- New `/tools` route (`pages/tools/(tools).page.ts`) so the DevTools tab has a
  landing page; card grid extracted to `components/tool-grid.component.ts` and
  shared with the home page.

## flowview pipeline for dev-auth pages (merged in `2138796`)

dev-auth's auth pages were migrated from inline HTML-in-TypeScript strings
(~800 lines deleted) to **flowview `.flow` templates**:

- `src/pages/*.flow` (8 pages since the provider migration added
  `consent.flow` and `signed-in.flow`), `scripts/compile-flow.mjs`,
  `scripts/watch-flow.mjs`, `src/types/flowview.d.ts`, `@flowview/runtime` dep.
- `pages/*.ts` are thin wrappers calling the compiled `render()` from
  `*.flow.js`; `wrangler.toml` runs the compile as its `[build] command`.
- **The Rust-binary requirement is gone** (2026-08-07). `compile-flow.mjs` now
  calls `@flowview/compiler`, the WASM compiler published on npm, so every
  machine and CI job can recompile after `pnpm install`. `flow-manifest.json`
  and its hash-staleness check were deleted along with it — the build always
  compiles for real, so outputs can no longer drift from their sources.
  Verified: the npm compiler reproduces the previously committed `.flow.js`
  byte for byte.

## What works today

- App shell: navbar with Deployment/DevTools sections, section-scoped sidebar,
  `/tools` index. `pnpm check` is green.
- All 10 tool pages under `/tools/*` (client-side: QR, bg-remover, image
  compressor, data converter, OG generator, palette, screen recorder, SEO
  simulator, SVG optimizer, URL shortener).
- Full auth flow in local dev: `pnpm dev:all`, then "Continue with DevAuth" at
  :4200 → authenticate at :8787 (email/password or GitHub) → back to :4200
  with DevFlare's own session. Verified end-to-end in a real browser
  (Playwright) against the migrated `@better-auth/oauth-provider` on
  2026-08-10 — see that section above. Not yet re-verified in production; see
  Next steps. Needs a matching client secret on both sides (see
  apps/dev-auth/README.md). `pnpm seed:user` test account
  (`test@devflare.com` / `TestPass123`).
- DevFlare's server-side half of that flow now runs through `@org/dev-auth-core`
  (a new, reusable headless consumer SDK) instead of duplicated protocol code,
  and its Angular auth facade (`@org/auth`) is the generalized adapter other
  apps could reuse. Re-verified live end-to-end 2026-09-03 — see "DevAuth
  consumer SDK" above.
- Optional Angular consumer UI now lives in `@org/auth-ui`: standalone
  `<dev-auth-sign-in>` and `<dev-auth-user-button>` components consume only the
  `@org/auth` signals/actions. DevFlare dogfoods both, including a projected
  Settings menu action. Loading, identity fallbacks, errors, keyboard navigation,
  Escape/focus restoration, reduced motion and SSR are covered. Verified locally
  end-to-end and at desktop/mobile sizes on 2026-09-04 (Spec 012).
- DevFlare's dashboard (`/`) now requires a session (`authGuard`), same as
  `/deploy`, `/projects`, `/settings`. `/tools/*` stays public.
- Projects API (`GET/POST /api/v1/projects`, `GET/PATCH/DELETE
/api/v1/projects/[id]`), auth-gated, backed by Cloudflare D1 — locally via
  miniflare state in `.wrangler/`. The `{ rows }` envelope bug that broke the
  list and made single-project GET/DELETE always 404 is fixed (spec 005).
- **Cloud section (spec 005, verified against the real account 2026-08-14).**
  `/cloud`,
  `/cloud/storage` and per-resource detail pages read the account through
  `/api/v1/cloud/*`, which is admin-gated and holds `CLOUDFLARE_API_TOKEN`
  server-side. With no token configured every page shows a connect prompt
  rather than an error. With the token in `apps/devflare/.dev.vars` it lists 15
  Workers, 10 Pages projects, 9 D1 databases, 2 KV namespaces and 7 R2 buckets,
  with deployment history, Worker versions and working project links.
  **Every Pages project on this account is a direct upload (`ad_hoc`), not
  git-connected**, so Cloudflare has no source to rebuild and the Deploy button
  never appears — correctly. Rollback is offered and has not been fired.
- **Cloudflare in Settings → Integrations (spec 010, verified locally
  2026-08-18).** The connection (account, scopes, connect/disconnect) and the
  OAuth client itself, whose id and secret can now be entered from the UI and
  are stored sealed in D1 — `wrangler secret put` is no longer the only way to
  configure the client. Environment variables remain the fallback. Renders only
  for administrators, decided by `/api/v1/cloud/status`.

## Known gaps / not production-ready

- **No transactional email provider.** `sendVerificationEmail` in
  `auth.config.ts` only `console.log`s the URL, so nobody can complete a
  verification. Because of that `requireEmailVerification` and `sendOnSignUp`
  are both **off**, and access is gated by the `SIGNUP_ALLOWLIST` var instead
  (currently one address). Wiring up Resend/SES means turning both back on and
  widening or dropping the allow-list. The allow-list also covers GitHub
  sign-in: the address GitHub returns must be listed or account creation 403s.
- The Analog app has **no staging environment** — staging covers dev-auth only.
  Adding it needs a `devflare-db-staging` D1 plus an `[env.staging]` block.
  Staging also has no GitHub OAuth App: an App takes a single callback URL, so
  staging needs its own before `GITHUB_CLIENT_ID` can be set there.
- `deployments` table still exists for future history, but the manual deploy UI
  has been removed from the app surface. The Deployment section is now a
  personal Cloudflare projects dashboard.
- ng-primitives 0.110.2 logs `nativeElement.addEventListener is not a function`
  (from `NgpLabel`) on every SSR render of a page with a Volt form field. Noisy
  but non-fatal — the HTML still renders and e2e is green. Upstream issue.
- **`db.sql` returns `{ rows, success }`, not an array.** Fixed for the projects
  routes in spec 005 (`server/lib/project-rows.ts` reads the envelope in one
  place, with tests), but the shape is still a trap for any new route. It stayed
  invisible for as long as it did because `tsconfig.app.json` excludes
  `src/server/routes` — that code cannot be typechecked without Nitro's
  generated types, so `pnpm typecheck` never looks at it.
- **A `server/lib/<x>.ts` cannot share a name with a `server/routes/**/<x>/`directory.**`lib/projects.ts`imported from`routes/api/v1/projects/\*`breaks
the Nitro **dev** server for every route with`Could not resolve
  "../../../../lib/projects"`, while `nx build`resolves it fine — so the
failure only appears when the app is actually run. Hence`project-rows.ts`.
- The deprecated `oidc-provider` plugin is **gone** (2026-08-09) — dev-auth runs
  on `@better-auth/oauth-provider`. What remains from it: the three
  `*_legacy_oidc` tables, kept rather than dropped so nothing was destroyed in
  the same migration that renamed them. Dropping them is a later, deliberate
  step once their contents have been looked at.
- Routing is AnalogJS file-based routing. `provideFileRouter()` is wired in
  `app.config.ts`; authenticated routes live under the `(app)` route group, and
  guards/redirects belong in `routeMeta`.

## Next steps (owner's apparent intent — confirm before large work)

0. **Commit and open a PR for Spec 012** from
   `feature/012-dev-auth-angular-ui`. The implementation and verification are
   complete locally but no commit, PR, deployment, or production verification
   exists yet. Separately confirm migration `0006` (Spec 011) reached remote D1.
1. **Connect Cloudflare in production.** Everything else is in place: the
   OAuth client exists (`5246101a…`, both redirect URIs registered), the
   client id is in `[env.production.vars]`, and production runs the current
   code. Only the Worker secrets are missing — `wrangler secret put` is the
   one step an agent cannot take here (the permission classifier refuses it),
   so the owner runs, from `apps/devflare`:
   - `openssl rand -base64 32 | npx wrangler secret put SECRET_ENCRYPTION_KEY --env production`
     — nothing is sealed in production yet, so a fresh key is fine and does not
     have to match the local one. Note this is a _second_ key, unrelated to the
     dev-auth one in step 3.
   - Then either `npx wrangler secret put CLOUDFLARE_OAUTH_CLIENT_SECRET --env production`
     (the value is in `apps/devflare/.dev.vars`), or — once spec 010 is
     deployed — paste the same secret into Settings → Integrations, which stores
     it sealed in D1 and needs no deploy.
   - Then sign in as an admin, open Settings → Integrations or `/cloud`, press
     **Connect with Cloudflare** and approve the consent screen. That step is
     the owner's by definition.
   - Optional but recommended: `npx wrangler secret put CLOUDFLARE_API_TOKEN --env production`
     as the fallback credential (the same value as in `.dev.vars`; verified
     working against the live account on 2026-08-18). Cloudflare is not
     documented to return a refresh token to a self-managed client, so without a
     fallback the section can go dark 15 minutes after a grant and ask to be
     reconnected. Token scopes: Workers Scripts (Read), Cloudflare Pages (Edit),
     D1 (Read), Workers KV Storage (Read), Workers R2 Storage (Read).
     `CLOUDFLARE_ACCOUNT_ID` is already in `wrangler.toml`.
2. **Record the production client secrets somewhere durable** (password
   manager). This bit twice now: `wrangler secret put` replaces the whole
   `OAUTH_CLIENT_SECRETS` object, and Cloudflare secrets are write-only, so
   adding a fourth client means reproducing `devflare`, `imageryx` and
   `ally-dev` exactly. On 2026-08-21 `devflare` had to be **rotated** rather
   than reused because its value existed nowhere — and the replacement was
   generated into a shell variable and piped straight in, so it is once again
   unrecorded. The next client registration hits the same wall unless the three
   values are written down now.
3. **Set two Worker secrets before the Identity UI can do anything in
   production**, neither of which the spec 001–004 branch could set:
   - `ADMIN_API_TOKEN` on dev-auth **and** the same value as
     `DEV_AUTH_ADMIN_TOKEN` on DevFlare. Without it the Identity tab stays
     hidden — and since spec 005 the whole Cloud section goes with it, because
     `requireCloudAdmin` asks dev-auth who is an administrator rather than
     keeping a second list. Both show "Identity service unavailable".
   - `SECRET_ENCRYPTION_KEY` on dev-auth (`openssl rand -base64 32`). Without
     it GitHub credentials keep coming from the config vars and the settings
     API refuses to store a secret rather than storing it in the clear.
4. Wire up a transactional email provider, then re-enable
   `requireEmailVerification` / `sendOnSignUp`. Widening who may sign up no
   longer needs a deploy — it is the Access panel in Settings → Identity.
5. Release `@andersseen/icon` with the `lock`/`user` fix, then bump `CDN.icon`
   in `apps/dev-auth/src/pages/layout.ts`.
6. Follow-ups this and earlier work surfaced but did not fix:
   - `VoltInput` has no `label` input, so every `label="…"` in
     `settings.page.ts` renders nothing. The Profile tab's fields are unlabelled
     as a result.
   - `/api/admin` (backup, stats) still uses `ADMIN_SECRET`, a machine token
     with no acting human, alongside the new user-attributed `/admin/*`. Two
     admin surfaces with different auth models is worth collapsing.
   - Nested `<volt-tabs>` inside another tab's content don't work correctly in
     the installed `ng-primitives` (0.110.2) — the inner panel's active state
     resolves against the outer tabset instead of its own. Identity's four
     sub-tabs work around it with a plain button row (see
     `identity-section.ts`); worth revisiting if a dependency bump fixes it.
7. **Recommended next SDK phase**: pick one real second consumer (Imageryx is
   the natural candidate — it already exists as a registered client) and
   migrate it onto `@org/dev-auth-core` to prove the abstraction actually
   portable rather than DevFlare-shaped. That's also the point at which a
   real Analog-specific server adapter or a genuine npm publication becomes
   worth deciding on, rather than speculating about now.

## Session log

- **2026-09-04** — Completed Spec 012 on
  `feature/012-dev-auth-angular-ui`: created the optional `@org/auth-ui` Nx
  boundary with standalone SignIn and UserButton components over `@org/auth`.
  SignIn owns only the hosted-flow hand-off and renders loading/anonymous/
  authenticated/error states. UserButton uses Quartz overlay positioning,
  resilient image/initial/generic identity fallbacks, projected app actions,
  keyboard menu navigation, Escape, focus restoration, and delegated logout.
  Both use encapsulated CSS custom properties rather than DevFlare's theme and
  render a hydration-stable loading branch under SSR. DevFlare now dogfoods the
  components on `/login` and in its navbar, projecting Settings into the menu.
  Added 17 component tests; 18 auth E2E tests pass across Chromium, Firefox and
  WebKit. `pnpm check` and the real local hosted-login/callback/menu/logout flow
  pass; desktop/mobile screenshots were inspected. Uncommitted; no PR/deploy.

- **2026-09-03 (later)** — Built the first headless DevAuth consumer SDK. Step
  0 of this task was to close spec 011 first; it turned out already merged
  (PR #30) — the earlier same-day log entry below still said "uncommitted"
  because STATE hadn't been updated after the merge, which is itself the
  lesson: verify `git log`/`git branch` against this file rather than trusting
  it. Full account in "DevAuth consumer SDK" above; short version: extracted
  `apps/devflare/src/server/lib/oidc.ts`'s already-portable protocol code into
  a new `libs/shared/dev-auth-core` (`@org/dev-auth-core`) — discovery, PKCE,
  state/nonce, code exchange, userinfo, typed errors, 36 tests — and
  discovered `libs/shared/auth` (`@org/auth`) already _was_ the Angular
  consumer-session adapter the task wanted, just hardcoded to `/api/auth`;
  generalized it (`provideDevAuth({basePath?})`, `Auth`→`DevAuth`,
  `loading`→`isLoading`, `signIn`→`login`) instead of building a second
  package. DevFlare's login/callback routes now run on the new client with
  identical external behavior (redirects, error codes) to before. One real
  integration gap found and fixed: Nitro's server bundle doesn't inherit
  `nxViteTsPaths()`, so the first server-side `@org/*` import needed an
  explicit `nitro.alias` entry. `pnpm check` green; live Playwright pass of
  logout → login → dev-auth → callback → session → dashboard → logout, plus
  both callback error paths. Not committed — pending the owner's decision on
  branch/commit/PR.

- **2026-09-03** — Built spec 011 on `feature/011-identity-control-plane`
  (uncommitted): dev-auth's admin surface is now the four-area identity
  control plane the owner asked for (Applications/Users/Sessions/Providers).
  New: `routes/admin-users.ts` (list/get/ban/unban) and
  `routes/admin-sessions.ts` (list/revoke/revoke-all), both hand-rolled rather
  than better-auth's `admin` plugin — investigated first, rejected because its
  own request authorization is role/adminUserIds-based, which conflicts with
  this provider's deliberate ADMIN*EMAILS-only model (no DB write can promote
  an attacker to admin), and it bundles impersonation/role-setting endpoints
  this task explicitly excludes. Ban is a binary switch enforced by a new
  `databaseHooks.session.create.before` hook in `auth.config.ts` — blocks new
  sign-ins, leaves existing sessions alone by design (revoking those is the
  separate Sessions action). `oauthClientAudit` (spec 002) became the general
  admin audit table via one additive `targetType` column rather than a new
  parallel table. Applications gained status/scopes/timestamp display and a
  `disabled` toggle — the latter wasn't in the original design but turned out
  necessary once `GET /admin/clients` was found to silently drop disabled
  managed clients from the list entirely (`toRegisteredClient` correctly
  returns `null` for them, which is right for authorization and wrong for an
  admin list — fixed with a new `presentRow()` that reads the row directly
  for display). Migration `0006_users_sessions_admin.sql`, additive.
  Two real bugs surfaced by testing against the actual stack rather than
  assumptions: (1) the ban hook originally read the user through
  `ctx.context.internalAdapter.findUserById`, mirroring the `admin` plugin's
  own code — but better-auth's internal adapter silently drops any `user`
  column not registered as `additionalFields`, so `bannedAt` never came back;
  caught by a new integration test built against the real D1/drizzle adapter
  (not the `memoryAdapter` the rest of the OAuth test suite uses for speed),
  fixed by querying `env.DB` directly, matching how every other admin-added
  column in this service is already read. (2) nesting a second `<volt-tabs>`
  inside DevFlare's own Settings tab content renders a correctly-active
  trigger row but every inner panel stays `display: none` — the installed
  `ng-primitives` (0.110.2) resolves the inner panel's active state against
  the \_outer* tabset. Found by inspecting the live DOM after Playwright
  showed an empty tab; worked around with a plain button row + `@switch`
  instead of a second primitive-tabset, so Identity's four sub-tabs are their
  own the thing rather than nested tabs.
  Verified: `pnpm format:check`/`lint`/`typecheck`/`build` clean; `pnpm test`
  — 214 dev-auth (up from 182), 118 devflare, 8 core, 6 auth, 65 deploy, all
  passing; migration applied cleanly to local D1 with 2 existing users and
  prior audit history intact. Live via `pnpm dev:all` + Playwright, signed in
  as the local admin: all four Identity sub-tabs render real data (including
  9 real sessions accumulated across this project's own development
  history); banned and unbanned a real local user with a reason, confirmed in
  D1 and the audit trail; revoked a real (already-expired) session, confirmed
  gone from D1 with its own audit row and no effect on the live browser
  session. Not yet committed, pushed, or deployed — see Next steps 0.

- **2026-08-25** — Deployment was repositioned away from "Vercel clone /
  upload a folder" and into a personal Cloudflare projects dashboard. The main
  app now uses AnalogJS file-based routing (`provideFileRouter`) instead of the
  deleted manual `app.routes.ts`: `(app).page.ts` wraps authenticated
  dashboard/cloud/settings routes with `routeMeta.canActivateChild`, and
  `tools.page.ts` wraps public DevTools routes. `/deploy` and `/projects`
  remain as file-based redirects to `/`; `/login` is the canonical login route,
  with `/auth/login` redirected for compatibility. The dashboard itself lives
  at `(app)/(home).page.ts`, tracks the owner's project watchlist, and now shows
  one high-level card per product/project rather than one card per Cloudflare
  resource. Shared grouping logic in `(app)/dashboard-projects.ts` merges saved
  DevFlare metadata with related Cloudflare Pages/Workers; `/projects/[slug]`
  is the detail page that splits those related resources into Pages and Workers
  sections and offers redeploy only for git-connected Pages projects. DevFlare
  itself is one of those high-level groups, so `devflare`, `dev-auth-prod`,
  `dev-auth-staging`, `worker-devflare-hono`, `devflare-worker` and
  `control-bucket` do not appear as separate dashboard cards. The sidebar keeps
  the Volt shell container but now renders custom section headers and links, so
  group names read as non-clickable dividers and navigation options read as
  clickable rows with hover/active states. Follow-up dependency refresh kept the
  app on Angular 21 while moving Angular packages to `21.2.21`, VoltUI to
  `1.0.1`, Quartz Headless to `0.2.0`, added `angular-movement@0.8.0`, and
  bumped dev-auth's Lumen Icons CDN pin to `@andersseen/icon@0.1.1`.
  `angular-movement` is wired globally with subtle dashboard card enter/stagger
  motion. Quartz `0.2.0` requires `qzSplitterPanel`; the shell now uses it only
  for the expanded sidebar panel, lets the main area flex into the remaining
  space, and sets Volt's `--volt-sidebar-width` so the inner `<aside>` fills the
  resizable panel. Verified: `pnpm format:check`, direct `tsc -p
apps/devflare/tsconfig.app.json --noEmit`, direct ESLint over touched files,
  `pnpm exec vite build --config apps/devflare/vite.config.ts`, and Playwright
  route smoke against local Vite (`/projects` and `/projects/imageryx` redirect
  to `/login` signed out; `/tools` renders with shell; `/login` renders without
  shell). Full `pnpm lint` / `pnpm typecheck` through Nx still fail before
  targets run with `Failed to start plugin worker`.

- **2026-08-21 (later)** — Ally is **live in production**. PR #25 merged
  (`9b113a6`), deploy green at 21:27Z. Verified against the deployed issuer:
  `ally-dev` returns a signed handoff on both registered callbacks, `devflare`
  and `imageryx` still do too, and an unregistered URI is refused with
  `invalid_redirect`. Because `parseOAuthClients` drops a confidential client
  that has no secret, those four passes are also proof that all three entries
  landed in `OAUTH_CLIENT_SECRETS` correctly.
  What the secret step cost, and the trap to avoid next time:
  - **`devflare`'s production secret had to be rotated**, not reused. It was
    not in `apps/dev-auth/.dev.vars` (that file holds `devflare-dev`, the local
    client — a different id), and Cloudflare secrets cannot be read back. The
    new value went to `OAUTH_CLIENT_SECRETS` on dev-auth and to
    `DEV_AUTH_CLIENT_SECRET` on the DevFlare Worker in one shell session, from
    the same variable. It was never printed, so **it is unrecorded again** —
    see Next steps 1.
  - **`imageryx` was preserved** from the local `.dev.vars` copy on the
    reasoning that its dev server runs against this production issuer (its
    `localhost:5173` callback is registered here). **Confirmed correct** — the
    owner signed in to both DevFlare and Imageryx after the rotation, which is
    the only thing that proves a secret matches, since authorization alone never
    checks it.
  - Three actions were refused by the permission classifier and are the owner's
    by design: `gh pr merge`, `wrangler secret put`, and reading secrets out of
    `.dev.vars` to assemble them.

- **2026-08-21** — Registered **Ally** (`ally-dev`) as a confidential
  OAuth 2.1 / OIDC consumer, in `[env.production.vars] OAUTH_CLIENTS` only —
  Ally points `DEV_AUTH_URL` at the deployed issuer even in local development,
  which is the Imageryx precedent, so it needs no entry in the local `[vars]`
  block (and would be dropped there anyway without a matching local secret).
  Its two callbacks are `https://ally.andersseen.dev/api/auth/callback` and the
  loopback `http://127.0.0.1:8787/api/auth/callback`. Verified by running the
  edited production `OAUTH_CLIENTS` through the real `parseOAuthClients`: three
  clients register, no errors, no warnings, the secret is stored hashed, and
  both Ally origins land in `clientOrigins`.
  Three things worth carrying forward:
  - **The production domain is unverified.** Nothing in this repo references
    Ally, so `ally.andersseen.dev` is the value supplied in the request, not one
    that was checked against a live deployment. Redirect URIs are matched byte
    for byte, so if the deployed host differs, authorization fails with
    `invalid_request` until this entry is corrected.
  - **`:8787` in Ally's loopback callback is Ally's own port**, and it collides
    with local dev-auth (`pnpm dev:auth` binds the same one). They cannot both
    run locally; using the deployed provider is the way around it.
  - **`SIGNUP_ALLOWLIST` still gates who can reach Ally at all** — it is
    `andriipap01@gmail.com` in production, and it applies to GitHub sign-in too.
    Any other Ally user gets refused at sign-up, not at the client registration.

- **2026-08-18 (later)** — Spec 010: the Cloudflare account moved into
  Settings → Integrations, replacing a placeholder card that had a dead
  "Configure" button. Two cards: the connection (account, scopes, connect /
  disconnect) and the OAuth client itself, whose id and secret are now stored
  sealed in D1 with the environment variables as fallback — the resolution order
  dev-auth already uses for GitHub. `resolveCloudflareOAuthConfig` became async
  as a result and moved to `lib/cloudflare-oauth-client.ts`; the environment-only
  reader stayed behind as `envCloudflareOAuthConfig`.
  Three findings worth keeping:
  - **Production has no Cloudflare secrets at all** (`wrangler secret list --env
production`: only the two dev-auth ones). The live "connect your account"
    prompt was never about the code — see Next steps 0.
  - **Local sign-in was broken on `main`**: the development `DEV_AUTH_CLIENT_ID`
    held the Cloudflare OAuth client id instead of `devflare-dev`, so every
    authorization bounced back to the dev-auth login page with no error. Fixed
    here. A paste from spec 007.
  - **Cloudflare cannot be a sign-in provider**, so "add it next to GitHub on
    the login page" is not implementable: its discovery document advertises
    `claims_supported: ["sub"]` and nothing else — no email, no profile
    (re-checked live 2026-08-18). It authorizes API access; identity stays
    dev-auth's.
