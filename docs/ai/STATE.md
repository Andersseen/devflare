# STATE — Current status snapshot

> **Load this at the start of every session.** It is the hand-off note between
> work sessions and between agents.
>
> **How to update (mandatory when you finish meaningful work):** rewrite the
> sections below to reflect reality — don't append forever. Keep "Session log"
> to the last ~5 entries, newest first. Update the date. Facts only; no plans
> you didn't verify.

_Last updated: 2026-08-10_

## Branch & repo status

- On `main` at `63f908c`, in sync with `origin/main`.
- The oauth-provider migration is merged and deployed: PR #13 (`e582d30`)
  failed CI, PR #14 (`5b6c40e`) fixed it, and the merge `e36848e` deployed
  clean (2026-08-09T12:04:49Z). The login-page script-ordering fix and the
  dashboard auth guard (see the 2026-08-10 section below) are merged via PR
  #15 (`254c3ba`, `63f908c`) and deployed clean (2026-08-10T07:01:21Z, both
  `deploy-auth` and `deploy-app`). Production dev-auth is running
  `@better-auth/oauth-provider` with both fixes live.

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
- DevFlare's dashboard (`/`) now requires a session (`authGuard`), same as
  `/deploy`, `/projects`, `/settings`. `/tools/*` stays public.
- Projects API (`GET/POST /api/v1/projects`, `/api/v1/projects/[id]`), auth-gated,
  now backed by Cloudflare D1 — locally via miniflare state in `.wrangler/`.
  Verified end to end in dev (insert/select/delete against the `DB` binding).

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
- `deployments` table exists but the deploy feature (`libs/deploy`,
  `deploy.page.ts`) is skeletal.
- ng-primitives 0.110.2 logs `nativeElement.addEventListener is not a function`
  (from `NgpLabel`) on every SSR render of a page with a Volt form field. Noisy
  but non-fatal — the HTML still renders and e2e is green. Upstream issue.
- **`db.sql` returns `{ rows, success }`, not an array**, and the projects routes
  treat it as one: `projects/index.ts` returns `{projects: {rows: […]}}` (the
  Angular `Projects` service reads `data.projects` as an array), and
  `projects/[id].ts` checks `.length` on that object so GET/DELETE of a single
  project always 404s. Pre-existing, unrelated to the provider work, and invisible
  because `tsconfig.app.json` excludes `src/server/routes` — it cannot be
  typechecked without Nitro's generated types.
- The deprecated `oidc-provider` plugin is **gone** (2026-08-09) — dev-auth runs
  on `@better-auth/oauth-provider`. What remains from it: the three
  `*_legacy_oidc` tables, kept rather than dropped so nothing was destroyed in
  the same migration that renamed them. Dropping them is a later, deliberate
  step once their contents have been looked at.
- Routing is a **manual `app.routes.ts`**, not Analog's file-based router,
  despite the `*.page.ts` naming. `routeMeta` exports are therefore ignored;
  guards and route config go in `app.routes.ts`.

## Next steps (owner's apparent intent — confirm before large work)

1. Wire up a transactional email provider, then re-enable
   `requireEmailVerification` / `sendOnSignUp` and widen `SIGNUP_ALLOWLIST`.
2. Only then: register Imaginaryx for real (`OAUTH_CLIENTS` + a secret + its exact
   callback URI). Nothing else in dev-auth changes for it. When it's added,
   don't repeat 2026-08-10's mistake — set its `OAUTH_CLIENT_SECRETS` entry
   (and its consumer-side client secret) _before_ calling it done, and confirm
   with `wrangler secret list --env production` on both sides, not just a
   green build.
3. Release `@andersseen/icon` with the `lock`/`user` fix, then bump `CDN.icon`
   in `apps/dev-auth/src/pages/layout.ts`. The new `/` page uses `user` and
   `log-out`, so check those render before relying on them.
4. A local GitHub OAuth App now exists (callback
   `http://localhost:8787/api/auth/callback/github`, credentials in
   `apps/dev-auth/.dev.vars`) — GitHub sign-in can be exercised end-to-end
   locally, not just email/password.

## Session log

- **2026-08-09** — Migrated dev-auth off the deprecated
  `better-auth/plugins/oidc-provider` onto `@better-auth/oauth-provider`, and
  removed the last DevFlare-specific assumption from the provider. better-auth
  1.6.11 → 1.6.26 (scoped: same minor, nothing else upgraded). The hard part was
  that the new plugin has no in-memory `trustedClients` — it loads clients through
  the database adapter — which would have meant seeding client rows (and hashed
  secrets) into D1 and keeping them in sync with `OAUTH_CLIENTS`. Instead
  `client-registry.ts` decorates the adapter and answers the `oauthClient` model
  from configuration while refusing writes, so config stays the whole registry,
  D1 holds no client secrets, and the plugin's CRUD endpoints have nowhere to
  write even if the route blocks and `clientPrivileges` were both removed.
  `APP_URL` deleted: `/` is now the provider's own signed-in page instead of a
  redirect into DevFlare. Migration `0003` renames the three old provider tables
  aside rather than dropping them and creates the new four; users, sessions,
  accounts and JWKS are untouched. Verified: 103 dev-auth tests, full repo
  `format:check` + `lint` + `typecheck` + `test`, a `wrangler deploy --dry-run`
  Worker build, and 0000→0003 applied on a fresh local D1.

- **2026-08-08** — Turned dev-auth from DevFlare's auth service into a reusable
  OAuth 2.1 / OIDC identity provider, and made DevFlare one of its clients.
  Added better-auth's `oidc-provider` + `jwt` plugins, a config-driven client
  registry (`OAUTH_CLIENTS` in git, `OAUTH_CLIENT_SECRETS` as a secret), and the
  four provider tables plus `jwks` (migration `0002`). DevFlare now runs the
  authorization code flow server-side and keeps its own session in D1 (migration
  `0001_app_session`), so the `/api/auth/*` cookie-forwarding proxy and
  `auth-remote.ts` are gone and nothing depends on a shared cookie any more.
  Two latent bugs fell out of typing the better-auth options:
  `advanced.crossSubDomainCookie` was misspelled — the runtime reads
  `crossSubDomainCookies`, so the cross-subdomain cookie production supposedly
  depended on was **never actually enabled** (deleted rather than switched on,
  since the OAuth flow removes the need); and `allowDynamicClientRegistration:
false` only blocks _unauthenticated_ registration, so any signed-in user could
  have registered a client with their own redirect URIs — `/api/auth/oauth2/register`
  is now refused outright. Verified the whole flow twice: 78 unit/integration
  tests (including authorize → code → token → userinfo against the real
  better-auth instance), and by curl against a live `wrangler dev` Worker on D1.

- **2026-08-07** — Repaired the dev-auth auth pages, which rendered completely
  unstyled and could not log anyone in (branch `feature/dev-auth-fixes`).
  Four independent breakages:
  (1) **CSP**: `style-src` never listed unpkg, only `script-src` did, so the
  custom elements upgraded while all three CDN stylesheets were blocked —
  `and-layout`/`and-text` and the light-DOM component styles vanished.
  (2) **`and-input`**: every page listened for `andInput`, but the component
  emits `andInputChange`, so all form fields always read as empty and login,
  signup, forgot and the setup wizard were dead. Now they read `input.value`
  directly, which also picks up server-rendered defaults.
  (3) **`verify.flow`** shipped its own HTML shell pointing at two 404 CDN
  paths (`dist/and-web-components/…`); it is now a fragment rendered through
  `renderLayout` like every other page.
  (4) Toast type `'destructive'` is not in the component's union (`error` is),
  and `and-button` has no `full` prop — full width needs `::part(button)`.
  Also pinned the four `@andersseen/*` CDN versions (were `@latest`, so any
  upstream release could break production auth without a commit here) and
  dropped the no-op `data-color="devflare"`.
  Verified in a real browser: 0 CSP violations, card renders correctly,
  `and-input.value` reads back typed text.

- **2026-07-28** — Fixed the red `CI` workflow (e2e was the only failing task;
  lint/typecheck/test/build were green). Three causes: (1) the workflow
  installed only chromium while `playwright.config.ts` declares chromium +
  firefox + webkit, so 12 of 21 tests died with "Executable doesn't exist";
  (2) `index.html` still said `<title>devflare</title>` against a `/DevFlare/`
  assertion; (3) `/projects` was never protected — `authGuard` existed in
  `libs/shared/auth` but no route used it. Wired `authGuard` into `/projects`,
  `/deploy` and `/settings` in `app.routes.ts`, and made it correct: it now
  awaits `Auth.ready()` (the old synchronous version would have bounced a
  logged-in user on any hard reload, since the session loads async) and is a
  no-op during SSR. `projects.page.ts` now loads via `afterNextRender`, killing
  the `Failed to parse URL from /api/v1/projects` SSR error. 21/21 e2e green
  locally across all three browsers. Deploy workflows still red — same
  unrelated `code 7403` token problem (see Known gaps).
- **2026-07-28** — Fixed the red CI. Every run since the flowmark migration
  failed on `dev-auth:build`: the `.flow.js` outputs were gitignored, so CI had
  none of them, while `compile-flow.mjs` assumed they were committed. Also its
  staleness check compared mtimes, which git does not preserve, so it was
  non-deterministic on a fresh checkout. Un-gitignored and committed the 6
  outputs, replaced the mtime check with a SHA-256 manifest, and ignored
  `*.flow.js` in ESLint. `devflare` itself was already green — `dev-auth` was
  the only failed task. Deploy workflows remain red for an unrelated reason:
  the Cloudflare API token is rejected with `code 7403` (see Known gaps).
- **2026-07-28** — Moved hosting onto Cloudflare: Nitro `cloudflare-module`
  preset, app DB on D1, provisioned 3 D1 + 2 KV and applied all migrations,
  rewrote both deploy workflows (fixing a pre-existing bug where they passed a
  database name that never resolved under `--env`). Not deployed yet; secrets
  pending.
- **2026-07-28** — Fixed the VoltUI visual regression: the missing
  `@voltui/components/themes.css` import meant Tailwind purged every class used
  inside Volt's templates. Added the import plus the missing theme tokens, then
  restructured the shell (navbar with Deployment/DevTools sections,
  section-scoped sidebar, shared tool grid, new `/tools` page).
- **2026-07-06** — Added AI agent documentation set: root `AGENTS.md`/`CLAUDE.md`,
  `docs/ai/` (context, architecture, conventions, state, workflows),
  `docs/specs/` (SDD process + template). No app code touched.
