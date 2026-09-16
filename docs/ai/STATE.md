# STATE — Current status snapshot

> **Load this at the start of every session.** It is the hand-off note between
> work sessions and between agents.
>
> **How to update (mandatory when you finish meaningful work):** rewrite the
> sections below to reflect reality — don't append forever. Keep "Session log"
> to the last ~5 entries, newest first. Update the date. Facts only; no plans
> you didn't verify.

_Last updated: 2026-09-16_

## Branch & repo status

Verified directly against `git log --oneline -15`, `git branch --show-current`,
and `gh pr list --state all --limit 15` (open + merged) on 2026-09-16. **This section has drifted
before** (see the 2026-08-10 / 2026-09-03 / 2026-09-11 lessons) from carrying
forward a previous write-up's claim instead of re-checking. **Standing rule:
before writing anything here, run `git log`/`git branch`/`gh pr list`
yourself.**

- Current branch is **`feature/dev-auth-hardening`**, started from local
  `main` at `ef1662e` (merge of PR #39).
- `main` is `ef1662e` (merge of PR #39). Merged, newest first: **PR #39**
  (`fix/nx-release-github-releases`, combined `nx release` command so publish
  creates GitHub Releases), **PR #38** (SDK polish + npm publishing),
  **PR #37** (`feat: add DevAuth Elements`), PR #36 (DevAuth
  modular-architecture foundation), PR #35 (favicons), PR #34 (image-domain
  tooling moved to Imageryx), PR #33 (consent redirect field fix).
- **PR #32 (`feature/012-dev-auth-angular-ui`, "add optional DevAuth Angular
  UI") is CLOSED** as of 2026-09-04T09:15:31Z and superseded by PR #37.
- **PR #38 (`feature/dev-auth-sdk-polish`, MERGED 2026-09-12)** —
  everything built on top of the merged DevAuth Elements SDK this session:
  (a) real bugs found and fixed in the dogfooded SDK itself (global CSS
  token collision, the loading-skeleton width collapse, the fully-transparent
  account-menu panel, inconsistent slotted-menu-item styling — all in
  `libs/shared/dev-auth-elements`), (b) the `/dev-auth-sdk` showcase page
  moved into the `(app)` route group (it had no navbar/sidebar before — a
  real routing bug, not a styling one) and redesigned, (c) the dashboard's
  "Add Metadata" card repositioned, (d) the collapsed-sidebar icon-padding
  fix in `sidebar.component.ts`, and (e) the whole npm-publishing pipeline —
  see [docs/specs/015-dev-auth-npm-publishing.md](../specs/015-dev-auth-npm-publishing.md).
- **PR #39 fixed the PR #38 publish-pipeline follow-up**: the owner noticed no
  GitHub Release appeared after PR #38 merged; PR #39 switched CI to the
  combined `nx release` command so GitHub Releases are created.
- Production is current: the deploy for PR #23 succeeded at 2026-08-18T05:48Z
  and `wrangler d1 migrations list DB --env production --remote` reports nothing
  pending. Spec 010 adds migration `0004_cloudflare_oauth_client.sql`; spec 011
  adds migration `0006` — neither's remote-D1 application was reconfirmed this
  session (last confirmed: see 2026-08-18 / 2026-09-03 entries below).
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
- **Image-domain tooling moved to Imageryx** (PR #34, merged 2026-09-10):
  `image-compressor` and `svg-optimizer` are removed — pages, `@org/core`
  services, barrel exports, `TOOLS` registry entries, and the
  `browser-image-compression` dependency. `bg-remover` deliberately stays.
  See the 2026-09-10 session-log entry for the full account, including the
  matching work on Imageryx (a separate repo, own branch — check that repo's
  own STATE/context doc for whether it has since merged; not reconfirmed
  from here this session).

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

## DevAuth consumer SDK: `@dev-auth/core` + `@dev-auth/angular`

The first stable headless DevAuth consumer SDK, built by auditing DevFlare's
existing OIDC client code (`server/lib/oidc.ts` was already framework-agnostic
— fetch + Web Crypto only, no h3 import) and extracting the genuinely reusable
protocol pieces rather than inventing a new API. At the time, kept inside the
existing `@org/*` scope rather than a new `@dev-auth/*` npm scope — no library
in this monorepo has a `package.json` today, so publication readiness was
documented, not built. **Superseded 2026-09-11**: a real `@dev-auth` npm org
now exists, so the TS path aliases for all three DevAuth SDK packages moved
to `@dev-auth/core`/`@dev-auth/angular`/`@dev-auth/elements` (see the DevAuth
Elements section below) — still not actually published, just aliased under
the name they'll eventually publish as.

- **`libs/shared/dev-auth-core`** (`@dev-auth/core`): framework-agnostic
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
- **`libs/shared/dev-auth-angular`** (`@dev-auth/angular`) **generalized, not duplicated**: this
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
  (`export { Auth } from '@dev-auth/angular'`) that nothing imported. 17 tests (was 6).
- **DevFlare dogfoods it**: `server/lib/oidc.ts` shrank to just
  `resolveOidcConfig` (env/Cloudflare-binding reading — deliberately kept out
  of the SDK, since discovery/PKCE/state/exchange/userinfo/`safeReturnTo` are
  now `@dev-auth/core` re-exports) plus `getDevAuthClient(context)`.
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

## DevAuth Elements: framework-agnostic visual SDK (`@dev-auth/elements`)

The first visual layer of the DevAuth SDK that isn't Angular-only: native
Custom Elements `<dev-auth-sign-in>`/`<dev-auth-user-button>`, built with
Flowview (internal-only template authoring) and `@andersseen/web-components`
(`and-card`/`and-button`/`and-icon`/`and-skeleton`/`and-menu-list`). Full
design rationale, verified technical decisions, and the accessibility/test
inventory: [docs/specs/014-dev-auth-elements.md](../specs/014-dev-auth-elements.md).

- **`libs/shared/dev-auth-elements`** owns a framework-agnostic
  `createAuthController()` — the session client (`fetch` against this app's
  own `/api/auth/{session,login,logout,user}`, never OAuth/token exchange)
  relocated out of `@dev-auth/angular`, where it used to be Angular-entangled.
  `@dev-auth/angular`'s `DevAuth` service now wraps one `AuthController` via a new
  `DEV_AUTH_CONTROLLER` injection token instead of fetching itself;
  `provideDevAuth({ controller })` lets an app share one instance between
  Angular's signals and the elements. `dev-auth-elements` deliberately does
  **not** depend on `@dev-auth/core` (the OAuth/token-exchange package)
  even though the `domain:dev-auth-sdk` Nx boundary would allow it.
- **Light DOM, not Shadow DOM** (composition components, not design-system
  primitives — `@andersseen/web-components` already owns Shadow DOM for its
  own pieces regardless). Since there's no shadow root, native `<slot>`
  would be inert, so `<dev-auth-user-button>`'s `menu-actions` extension
  point is hand-rolled: light-DOM children captured once at first connect,
  re-appended into a plain outlet `<div>` after each re-render.
- **Menu primitive verified against actual source, not assumed**:
  `and-dropdown`'s panel is entirely `items`-array-driven with no slot for
  custom content, so it couldn't host an identity header + separator +
  extensibility slot. Uses `and-menu-list` in its slotted mode instead
  (`role="menu"` only — its own doc comment says slotted mode doesn't manage
  focus), with open/close/positioning/outside-click/Escape/roving-tabindex/
  Arrow-Home-End keyboard nav hand-rolled (ported from PR #32's already-
  framework-agnostic logic).
- **Flowview is genuinely internal-only**: `.flow` → committed `.flow.js`
  (`render(context): string`, same pattern `apps/dev-auth` already uses,
  `scripts/compile-flow.mjs` ported as-is) + a generated sibling `.flow.d.ts`
  (needed once `@dev-auth/angular`'s `declaration: true` typecheck pulls the import
  in transitively). Each element does `this.innerHTML = render(state)` on
  real state transitions only — interactive state (menu open/close) stays
  owned by plain DOM/CSS so focus and `and-menu-list`'s own state are never
  torn down mid-interaction. `@flowview/dom`/`reactive`/`vite*` are not
  installed anywhere in this repo and are not used here either — confirmed
  before designing around them, not assumed from the task brief's framing.
- **SSR-safe by construction**: every element's class body lives inside its
  `defineDevAuth*()` registration function, not at module scope. Verified
  both by a dedicated spec importing the package under Vitest's `node`
  environment (no DOM globals) and by a real check: `curl
http://localhost:4200/` renders the literal `<dev-auth-user-button>` tag
  with no server error.
- **DevFlare dogfoods both elements**: `login.page.ts`'s Volt sign-in card →
  `<dev-auth-sign-in>`; `navbar.component.ts`'s Volt avatar/menu →
  `<dev-auth-user-button>` with a slotted Settings link, themed via
  `--dev-auth-*` CSS custom-property overrides mapped from DevFlare's own
  tokens. `app.config.ts` builds one `AuthController` at module scope
  (browser-guarded, same pattern as the existing Sentry init) and hands it
  to both `provideDevAuthElements()` and `provideDevAuth()`.
- **`@andersseen/web-components`/`@andersseen/icon` added as real root
  dependencies** — previously CDN-only (`apps/dev-auth`'s hosted pages),
  nowhere in this repo's actual dependency tree before this.
- **Verified live** (`pnpm dev:all`-equivalent + Playwright, 2026-09-11):
  full round trip — `/login` → "Continue with DevAuth" → dev-auth hosted
  form → `test@devflare.com` credentials → `/api/auth/callback` →
  dashboard, navbar shows "Account menu for Test User" with "TU" initials →
  menu opens with focus on the first item (Settings) → Escape closes and
  restores focus to the trigger → Sign out clears the session,
  `<dev-auth-user-button>` renders empty → navigating to `/projects`
  afterward correctly redirects to `/login` via `authGuard`. Zero console
  errors other than a pre-existing, unrelated `apps/dev-auth` favicon 404.
- **Tests**: 64 in `dev-auth-elements` (controller, identity fallbacks,
  registration/SSR-safety, both elements' state/attribute/slot/event/
  keyboard/focus/cleanup behavior), 11 in `auth` (rewritten against a fake
  `AuthController`), 108 pre-existing `devflare` unit tests unaffected, 21
  `devflare-e2e` `auth.spec.ts` tests across Chromium/Firefox/WebKit.
- **Not done, by explicit task scope**: UserProfile/SignUp/account-
  settings/org-switcher/MFA components, React/Vue/Astro wrappers, npm
  publication, Imageryx integration, new `@andersseen/web-components`
  primitives (confirmed no `and-avatar` exists — not invented here either).

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
- DevFlare's server-side half of that flow now runs through `@dev-auth/core`
  (a new, reusable headless consumer SDK) instead of duplicated protocol code,
  and its Angular auth facade (`@dev-auth/angular`) is the generalized adapter other
  apps could reuse. Re-verified live end-to-end 2026-09-03 — see "DevAuth
  consumer SDK" above.
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

0. **DevAuth modular architecture is merged** (PR #36) — this item is done.
   Confirm migration `0006` (spec 011) actually reached remote D1, since
   that was still unconfirmed as of the last write-up that checked.
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
   migrate it onto `@dev-auth/core` **and** `@dev-auth/elements` to
   prove both abstractions actually portable rather than DevFlare-shaped.
   That's also the point at which a real Analog-specific server adapter or a
   genuine npm publication becomes worth deciding on, rather than
   speculating about now.
8. **Decide PR #32's disposition and commit/PR this session's DevAuth
   Elements work** (`feature/dev-auth-elements` — see "Branch & repo status"
   and spec 014). PR #32 is superseded, not merged into; recommended to
   close it once this work is reviewed, crediting the concepts this session
   reused from it.

## Session log

- **2026-09-16** — DevAuth SDK hardening
  (`feature/dev-auth-hardening`, off `main` @ `ef1662e`). Created spec 016 and
  began the requested hardening pass without adding new auth methods or
  Cloudflare Connect work. Added `libs/shared/dev-auth-client`
  (`@dev-auth/client`) as the headless browser/session package and moved the
  reusable `AuthController` contract there; `@dev-auth/angular` now depends on
  `@dev-auth/client` instead of `@dev-auth/elements`, while Elements remains
  visual-only over the same client. Hardened controller semantics: status now
  includes `error`, `/session` network/backend failures no longer collapse to
  anonymous, `createdAt`/`updatedAt` normalize from wire strings to real
  `Date`s, `returnTo` is sanitized on the client as defense-in-depth, request
  generation prevents stale session/profile/logout responses from overwriting
  newer state, and operation failures throw normalized
  `AuthControllerRequestError`s. Elements hardening so far: UserButton menu
  now portals its panel to `document.body` while open, copies computed DevAuth
  tokens onto that portaled panel, uses Popover/fixed anchored positioning with
  viewport collision handling and scroll/resize repositioning, and owns an
  explicit opaque surface/border/shadow instead of relying on the navbar
  stacking context; `and-menu-list` now uses the current `menu-label` API,
  SignIn uses intrinsic responsive sizing instead of a hard fixed width,
  explicit `.dark`/`.light`/`[data-theme]` ancestors are honored, and
  `dev-auth-state-change` no longer bubbles the user object.
  Packaging smoke tests outside TS path aliases found real issues and fixed
  them: published ESM needed `.js` relative imports; `@dev-auth/client` and
  `@dev-auth/elements` needed runtime dependency declarations (`tslib`, plus
  `@flowview/runtime` for Elements); Elements was accidentally publishing
  `src/lib/test-utils`, now excluded. Verification completed: targeted
  `dev-auth-client` + `dev-auth-elements` tests green, `dev-auth-angular`
  tests green, SDK build green before the later ESM/package-manifest smoke
  fixes, `pnpm format:check` green, direct TS checks for client/elements
  green, packed `@dev-auth/client` and `@dev-auth/elements` import in plain
  Node fixtures with local deps linked. Not yet complete: full repo
  `pnpm lint`/`typecheck`/`test`/`build`, browser visual baseline, final
  closeout, commit, push, and PR. Local wrinkle: after several Nx resets,
  `pnpm lint`/some `nx run-many` commands intermittently hang during
  "Calculating the project graph" or fail with "Failed to start plugin
  worker"; reset/daemonless runs may be needed before final verification.

- **2026-09-12** — DevAuth SDK polish + npm publishing
  (`feature/dev-auth-sdk-polish`, off `main` @ `5f271c6`, merged as PR #38).
  Two parts, both requested mid-session by the owner after live-testing
  PR #37's merged SDK and finding it visibly broken in several ways.
  **Part 1 — real bugs in the dogfooded SDK**, each root-caused rather than
  dismissed as stale state (the owner explicitly called out prior
  "it's just cache" claims that turned out wrong): the `/dev-auth-sdk`
  showcase page had no navbar/sidebar at all — it lived outside the `(app)`
  route group, a routing bug, not styling; `.dev-auth-card` had no width of
  its own, so the loading-state skeletons collapsed to slivers inside any
  centered ancestor (the standard way to center a login card); `.dev-auth-panel`
  (the account menu) had no background/border/shadow of its own — genuinely
  transparent, with page content visible through it; a consumer-slotted
  `menu-actions` item (e.g. DevFlare's own "Settings" link) never received
  the component's own menu-item styling, unlike "Sign out". Also: the
  dashboard's "Add Metadata" card moved above the project list, and a real
  collapsed-sidebar padding bug in `sidebar.component.ts` (unrelated to the
  SDK — the nav/link padding stacked with `VoltSidebarContent`'s own
  internal padding, leaving ~0px for a 20px icon). **Part 2 — npm
  publishing**: `@dev-auth/core`/`@dev-auth/angular`/`@dev-auth/elements`
  are now real, independently-versioned, publishable packages (`nx release`,
  a new `workflow_dispatch`-triggered `.github/workflows/publish.yml`) —
  full design and the four CI-pipeline bugs found only by dry-running it
  (not by reading docs) are in
  [docs/specs/015-dev-auth-npm-publishing.md](../specs/015-dev-auth-npm-publishing.md).
  One of those bugs was found post-merge: after PR #38 landed the owner
  asked why no GitHub Release appeared, which led to discovering the CI
  workflow's split `nx release version`/`nx release publish` subcommands
  never generate a changelog or create a release at all — only the combined
  `nx release` command does all four phases (version, changelog, GitHub
  Release, publish) together. Fixed as a follow-up commit on a new branch
  off `main` (PR #38 had already merged by the time this was found).
  Root `package.json` flipped to `"private": true"` (was `false`, a footgun
  once a publish pipeline existed). Full repo `pnpm format:check && pnpm
lint && pnpm typecheck && pnpm test` and `nx run-many -t build` across the
  app + all three libraries green; local `nx release`/`npm pack` dry runs
  clean. Not yet: the owner adding the `NPM_TOKEN` GitHub Environment
  secret, or a first real publish (see spec 015 §7 for the remaining
  checklist).

- **2026-09-11 (later)** — DevAuth Elements: the first framework-agnostic
  visual SDK layer (`feature/dev-auth-elements`, off `main`, uncommitted).
  Full account: [docs/specs/014-dev-auth-elements.md](../specs/014-dev-auth-elements.md)
  and the "DevAuth Elements" section above. Read PR #32 (open, unmerged
  Angular UI) as prior art rather than merging it — mined its identity-
  fallback algorithms and accessibility contract, replaced its two Angular-
  only dependencies (`quartz-headless`, `lucide-angular`) with native code
  and `@andersseen/web-components`. Verified real facts before designing
  around them rather than trusting the task brief's framing: read
  `and-dropdown`'s and `and-menu-list`'s actual compiled source (changed the
  menu-primitive plan once `and-dropdown` turned out to have no body slot);
  confirmed `@flowview/dom`/`reactive`/`vite*` aren't installed anywhere in
  this repo, so Flowview's role here is the same server-string-render
  pattern `apps/dev-auth` already uses, not the DOM-runtime the brief
  assumed; confirmed `@andersseen/web-components` wasn't an npm dependency
  anywhere (CDN-only) and added it for real. Relocated the framework-
  agnostic half of `@dev-auth/angular`'s session client into the new package and put
  `@dev-auth/angular`'s `DevAuth` service on top of it via a new `DEV_AUTH_CONTROLLER`
  injection token, so DevFlare's Angular signals and the new elements share
  one `/api/auth/session` fetch instance instead of running two. Dogfooded
  in DevFlare (`login.page.ts`, `navbar.component.ts`, `app.config.ts`) and
  verified the complete real flow live: hosted-login → callback →
  authenticated navbar → accessible menu (focus-in-on-open, Escape-closes-
  and-restores-focus) → logout → guard redirect back to `/login`. 64 new
  tests in the library, `auth`'s 11 tests rewritten against the new
  controller boundary, `devflare-e2e`'s `auth.spec.ts` updated (21 tests,
  Chromium/Firefox/WebKit). `pnpm format:check && pnpm lint && pnpm
typecheck && pnpm test` green. Merged as PR #37 on 2026-09-11T21:09Z.
  Recommended follow-up (still open): close PR #32 (superseded), crediting
  its reused concepts, and pick a second real consumer (Imageryx, paused
  pending the `@dev-auth` npm scope — see the 2026-09-12 entry above this
  one) to prove `dev-auth-elements` actually portable outside DevFlare.

- **2026-09-11** — DevAuth modular architecture foundation
  (`feature/dev-auth-modular-architecture`, off `main`, uncommitted). Task
  was explicitly architecture-only: draw boundaries between DevAuth Identity
  (`apps/dev-auth`), the DevAuth Consumer SDK (`libs/shared/dev-auth-core` +
  `libs/shared/dev-auth-angular`), and a future separate Cloudflare Connect service —
  no feature code, no UI, no OAuth broker implementation. Full account:
  [docs/specs/013-dev-auth-modular-architecture.md](../specs/013-dev-auth-modular-architecture.md).
  Git safety first: working tree was clean on `main`, so the "unrelated
  active DevFlare work" the task warned about turned out to already be
  merged (PR #34) rather than sitting dirty — but a real piece of unrelated,
  unmerged, in-flight work was found by checking remote branches/open PRs
  that a `git status`-only check would have missed: **PR #32**
  (`feature/012-dev-auth-angular-ui`, open) already implements the DevAuth
  UI layer this task said not to build, under `libs/shared/auth-ui`
  depending on `@dev-auth/angular`. That finding drove two decisions: rejected
  renaming `@dev-auth/angular` (would conflict with that branch on merge) and did
  not scaffold `libs/shared/auth-ui` (a real implementation already exists
  there). Dependency audit (grep + reading the actual files, not assumed):
  `apps/dev-auth` imports nothing else in the repo; `@dev-auth/core` is
  genuinely framework-agnostic OIDC (not hardcoded to dev-auth's issuer) and
  is already reused by DevFlare's _unrelated_ Cloudflare-OAuth-for-its-own-
  account code (`cloudflare-oauth.ts`) for generic PKCE primitives only —
  legitimate today, flagged as a future naming smell once Cloudflare Connect
  is a real separate deployable; `@dev-auth/angular` is not an OAuth client at all,
  just an Angular facade over a consumer app's own session cookie. Added a
  `domain:*` Nx tag dimension (additive to the existing `scope:`/`type:`
  one) with `depConstraints` in `eslint.config.mjs` enforcing `dev-auth` ↛
  `dev-auth-sdk`/`devflare`/`cloudflare-connect`, `dev-auth-sdk` ↛
  `devflare`/`cloudflare-connect`, `cloudflare-connect` ↛
  `dev-auth`/`devflare` — verified live by temporarily adding a real
  violating import to `apps/dev-auth/src/index.ts`, confirming
  `nx run dev-auth:lint` failed with the expected
  `@nx/enforce-module-boundaries` error, then reverting it (not left behind
  as a committed test — the lint rule itself is the ongoing check). Also
  closed a pre-existing gap: `scope:backend` had no `depConstraints` rule at
  all before this. New minimal `apps/cloudflare-connect` (Hono/Workers,
  mirroring `apps/dev-auth`'s project shape): `GET /health`, no bindings, no
  OAuth code, 2 smoke tests, README covering responsibility/non-
  responsibilities/dependencies/deployment/data/security ownership/consumer
  examples. Produced a file-by-file migration map for
  `apps/devflare/src/server/lib/cloudflare-{oauth,oauth-client,connection}.ts`
  and `cloudflare.ts` (protocol-level vs. DevFlare-persistence-specific vs.
  needs-redesign-before-extraction) — none of it moved, per task scope.
  Verified: `npx nx run-many -t lint,typecheck,test --projects=dev-auth,
devflare,devflare-e2e,auth,core,dev-auth-core,ui,deploy,cloudflare-connect`
  all green (dev-auth/devflare/auth/deploy test counts unchanged from
  before; 2 new cloudflare-connect tests). This section and PR/merge state
  above were corrected against `git log`/`gh pr list` directly, catching two
  more stale "uncommitted" claims (PRs #31, #34) — see spec 013 §10. Not
  committed — pending the owner's decision on branch/commit/PR.

- **2026-09-10** — Image-domain tooling (compression, format conversion, SVG
  optimization) moved to Imageryx; the DevFlare duplicates were removed.
  This was the first consolidation slice of an explicit product-boundary
  decision: Imageryx owns image/media tooling, DevFlare stays generic
  developer/control-plane tools. Cross-repo session — both repos are local
  siblings under `Web/Projects/`, so this covers both, unlike this
  session's usual single-repo scope.
  **On Imageryx** (`feat/image-optimization-consolidation`, off `main`, not
  yet committed): compression/format now flow through the existing
  preset/provider architecture rather than a new tool — `CloudflareImagesProvider`
  was rewired from a scaffolded-but-wrong API (`cf.image`/`/cdn-cgi/image/`,
  zone-based) onto the real Workers Images Binding (`env.IMAGES`), now a
  genuinely working provider instead of one whose `transform()` always
  threw; SVG optimization is a new fourth `BuiltinTransformationProvider`
  (real, local, deterministic, via `svgo/browser` — verified running
  inside actual workerd, not just Node) that `selectTransformationProvider()`
  always routes `outputFormat: "svg"` presets to, regardless of the
  deployment's configured provider. Two new system presets ("Web
  Optimized", "SVG Optimized"), a D1 migration widening two `CHECK`
  constraints (empirically verified against seeded data — no cascade
  delete, still rejects invalid values — and independently reviewed), and
  a real bug an integration test caught before it shipped: the deployment's
  configured provider was silently overriding the new svg-routing rule on
  every non-mock deployment until `requestVariant()` was fixed to stop
  treating it as an implicit preference for svg presets. `pnpm check`
  green across all 41 tasks; a live Cloudinary integration test happened
  to run for real (credentials were present locally) alongside the new
  SVG one. Full account in that repo's `context.md`, new "Image
  optimization consolidation" section.
  **On DevFlare** (this repo, `feature/remove-duplicate-image-tools`, not
  yet committed): removed `image-compressor`/`svg-optimizer` — both page
  components, both `@org/core` services, their barrel exports, and their
  `TOOLS` registry entries — and the now-orphaned `browser-image-compression`
  dependency. `bg-remover` deliberately stays (separate architecture
  decision, out of scope here); no other generic tool touched. The
  DevFlare SVG optimizer turned out to be a naive regex minifier that
  also stripped `<title>`/`<desc>` (real accessibility content, not just
  cruft) and rendered pasted SVG through `[innerHTML]` with zero
  sanitization — both defects are moot now that the page is gone, not
  fixed in place. Replaced the two removed cards with one "Imageryx" card
  linking to `https://imageryx-dashboard.pages.dev`; `ToolGridComponent`
  needed a small addition to support an external (non-`routerLink`) card,
  since nothing there did before. `pnpm format:check`/`lint`/`typecheck`/
  `test`/`build:prod` all green; did not visually walk `/tools` in a
  browser — the `ui-check` skill that would normally do that is reserved
  for explicit user invocation and its workflow may not be replicated by
  other means, so this is unverified in a live browser. Neither repo's
  branch has been committed, pushed, or PR'd — pending the owner's
  decision, per this session's standing git-safety rule (never commit
  without being asked).

- **2026-09-03 (later)** — Built the first headless DevAuth consumer SDK. Step
  0 of this task was to close spec 011 first; it turned out already merged
  (PR #30) — the earlier same-day log entry below still said "uncommitted"
  because STATE hadn't been updated after the merge, which is itself the
  lesson: verify `git log`/`git branch` against this file rather than trusting
  it. Full account in "DevAuth consumer SDK" above; short version: extracted
  `apps/devflare/src/server/lib/oidc.ts`'s already-portable protocol code into
  a new `libs/shared/dev-auth-core` (`@dev-auth/core`) — discovery, PKCE,
  state/nonce, code exchange, userinfo, typed errors, 36 tests — and
  discovered `libs/shared/dev-auth-angular` (`@dev-auth/angular`) already _was_ the Angular
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
