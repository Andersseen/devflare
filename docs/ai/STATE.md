# STATE — Current status snapshot

> **Load this at the start of every session.** It is the hand-off note between
> work sessions and between agents.
>
> **How to update (mandatory when you finish meaningful work):** rewrite the
> sections below to reflect reality — don't append forever. Keep "Session log"
> to the last ~5 entries, newest first. Update the date. Facts only; no plans
> you didn't verify.

_Last updated: 2026-08-21_

## Branch & repo status

- On `feature/register-ally-client`, **not pushed**: registers Ally as a
  dev-auth consumer (config only, no spec doc — it is one `OAUTH_CLIENTS` entry).
- `main` is `208498a` and now contains spec 010 as well (PR #24), on top of
  specs 007, 008 and 009 (PRs #21, #22, #23). Spec 006 merged earlier as PR #20
  and still has no live verification; 001–005 merged before that (PRs #17–#19).
- Production is current: the deploy for PR #23 succeeded at 2026-08-18T05:48Z
  and `wrangler d1 migrations list DB --env production --remote` reports nothing
  pending. Spec 010 adds migration `0004_cloudflare_oauth_client.sql`, which the
  deploy workflow will apply.
- **Spec 010 is verified locally** (Settings → Integrations, save/clear round
  trip, sealed row in D1). Specs 006–009 are still unverified in a browser.
- **Production has never had a Cloudflare credential.**
  `wrangler secret list --env production` on the DevFlare Worker returns only
  `DEV_AUTH_ADMIN_TOKEN` and `DEV_AUTH_CLIENT_SECRET` — no
  `SECRET_ENCRYPTION_KEY`, no `CLOUDFLARE_OAUTH_CLIENT_SECRET`, no
  `CLOUDFLARE_API_TOKEN`. That, and nothing else, is why the live `/cloud`,
  `/cloud/buckets` and `/cloud/storage` show the "paste an API token" prompt.
  See Next steps 0.
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
- `deployments` table exists but the deploy feature (`libs/deploy`,
  `deploy.page.ts`) is skeletal.
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
- Routing is a **manual `app.routes.ts`**, not Analog's file-based router,
  despite the `*.page.ts` naming. `routeMeta` exports are therefore ignored;
  guards and route config go in `app.routes.ts`.

## Next steps (owner's apparent intent — confirm before large work)

0. **Connect Cloudflare in production.** Everything else is in place: the OAuth
   client exists (`5246101a…`, both redirect URIs registered), the client id is
   in `[env.production.vars]`, and production runs the current code. Only the
   Worker secrets are missing — `wrangler secret put` is the one step an agent
   cannot take here (the permission classifier refuses it), so the owner runs,
   from `apps/devflare`:
   - `openssl rand -base64 32 | npx wrangler secret put SECRET_ENCRYPTION_KEY --env production`
     — nothing is sealed in production yet, so a fresh key is fine and does not
     have to match the local one. Note this is a _second_ key, unrelated to the
     dev-auth one in step 2.
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
1. **Set `OAUTH_CLIENT_SECRETS` on dev-auth production** so the newly
   registered `ally-dev` client can authenticate. `wrangler secret put` replaces
   the whole JSON object, so the value must carry `devflare` and `imageryx`
   forward alongside `ally-dev` — re-putting it with only the new entry takes
   DevFlare's and Imageryx's sign-in down. Those two production values are not
   recoverable from this repo or from `wrangler`; they have to come from
   wherever the owner keeps them.
2. **Set two Worker secrets before the Identity UI can do anything in
   production**, neither of which the spec 001–004 branch could set:
   - `ADMIN_API_TOKEN` on dev-auth **and** the same value as
     `DEV_AUTH_ADMIN_TOKEN` on DevFlare. Without it the Identity tab stays
     hidden — and since spec 005 the whole Cloud section goes with it, because
     `requireCloudAdmin` asks dev-auth who is an administrator rather than
     keeping a second list. Both show "Identity service unavailable".
   - `SECRET_ENCRYPTION_KEY` on dev-auth (`openssl rand -base64 32`). Without
     it GitHub credentials keep coming from the config vars and the settings
     API refuses to store a secret rather than storing it in the clear.
3. Wire up a transactional email provider, then re-enable
   `requireEmailVerification` / `sendOnSignUp`. Widening who may sign up no
   longer needs a deploy — it is the Access panel in Settings → Identity.
4. Release `@andersseen/icon` with the `lock`/`user` fix, then bump `CDN.icon`
   in `apps/dev-auth/src/pages/layout.ts`.
5. Two follow-ups this work surfaced but did not fix:
   - `VoltInput` has no `label` input, so every `label="…"` in
     `settings.page.ts` renders nothing. The Profile tab's fields are unlabelled
     as a result.
   - `/api/admin` (backup, stats) still uses `ADMIN_SECRET`, a machine token
     with no acting human, alongside the new user-attributed `/admin/*`. Two
     admin surfaces with different auth models is worth collapsing.

## Session log

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

- **2026-08-18** — Two rounds of "check before building", both of which changed
  the plan. The R2 bucket browser (spec 008) was going to need a tree component;
  Cloudflare's object listing takes `prefix` + `delimiter` and answers one level
  at a time, so a breadcrumb and a list is not just simpler, it is the shape the
  API hands you. Then the tree was going to be written for `quartz-headless` —
  except Quartz already ships `tree` _and_ `splitter`, along with dialog,
  drag-drop, overlay, toast, tooltip, viewport and virtual-scroll. Its tree does
  take the whole hierarchy up front (`nodes` is a required input of nested
  `children`), which is the real gap if anyone wants it for object storage.
  The resizable sidebar (spec 009) then became integration, not authoring. Two
  things had to be worked around and are worth remembering: `VoltSidebar`
  declares **no inputs at all** and hardcodes `w-72`, so the width is overridden
  from `styles.css` with a two-element selector that outranks the utility class;
  and the splitter's position is a percentage, which is the wrong unit for a
  sidebar, so the percent drives the width while CSS clamps it in pixels. The
  width travels as a custom property rather than an inline style precisely so a
  media query can ignore it below `md`, where the sidebar is a fixed slide-over.
  Also fixed: the Deployment dashboard was listing the entire DevTools catalogue
  (`PLATFORM_CARDS` plus every tool), duplicating `/tools`.

- **2026-08-17** — Built spec 007 on `feature/007-cloudflare-oauth-connect`: the
  Cloud section can now be connected from Cloudflare's own consent screen
  instead of a token pasted into a secret store. This only became possible on
  2026-06-03, when Cloudflare shipped self-managed OAuth clients — the earlier
  assumption that Cloudflare had no third-party OAuth was simply out of date.
  Everything protocol-shaped was read from the live service rather than guessed:
  the four endpoints, `S256` and `client_secret_post` from
  `dash.cloudflare.com/.well-known/openid-configuration`, and all eight scope ids
  from `GET /client/v4/oauth/scopes` (383 of them). Worth recording that the same
  discovery document declares `claims_supported: ["sub"]` and no email — so
  Cloudflare cannot be a login provider for dev-auth even if that were wanted,
  which is the question this work started from.
  Tokens live in D1 sealed with AES-GCM rather than in a Worker secret, because
  a secret cannot be rewritten from inside a request and a rotated refresh token
  that cannot be persisted works exactly once. Two failure modes got explicit
  handling for the same reason: concurrent refreshes are serialised per isolate
  (rotation would otherwise burn the token), and an `invalid_grant` clears the
  refresh token so the UI asks for a reconnect instead of retrying forever.
  Not verified: anything past the consent screen. No OAuth client exists yet, and
  the account's current API token cannot create one — it lacks `OAuth Clients
Write`, which is deliberate and should stay that way.
  `pnpm format:check`, `lint`, `typecheck`, `test` (8 files / 100 tests in
  devflare, 32 new) and `nx build devflare` all green; migration 0003 applied
  locally. One real fix fell out of the build rather than the tests: TS 5.9 types
  `TextEncoder.encode` as writing into an arbitrary `ArrayBufferLike`, which Web
  Crypto's `BufferSource` rejects — `typecheck` misses it because
  `tsconfig.app.json` excludes `src/server/routes`, so it only surfaced when a
  spec imported the module.

- **2026-08-15** — Built spec 006 on `feature/006-pages-direct-upload`: `/deploy`
  now uploads a built folder straight to a Pages project through the direct
  upload API, and the `deployments` table finally has a writer and a reader.
  The load-bearing discovery came from reading `wrangler`'s bundled source in
  `node_modules` rather than any documentation: the hash Pages identifies an
  asset by is **BLAKE3 over the base64 text of the file concatenated with its
  extension**, truncated to 32 hex chars. WebCrypto cannot do BLAKE3, and no
  public API reference describes the construction. Getting it wrong fails
  silently and expensively — `check-missing` would report every asset as absent,
  so deploys keep succeeding while re-uploading the whole site forever. Pinned
  with six vectors generated from `blake3-wasm@2.1.5`, the package wrangler
  itself bundles, then checked again over all 37 files of a real `dist/`: zero
  divergence across 9 extension types including `.wasm`, `.ico` and
  extensionless files.
  Hashing and base64 run in the browser because a Worker is billed on CPU time,
  not wall time — waiting on `fetch` is free, but encoding 25 MiB would blow the
  free plan's 10 ms budget. The Worker holds the credential and forwards bytes.
  `libs/deploy` was an Nx library with no source files and `targets: {}`; both
  its `project.json` and `tsconfig.json` reached three levels up for a repo root
  two levels away, so they pointed outside the repository. Nothing had noticed
  because there was no code to break.
  The WebContainer mock is gone. It was dead twice over: it faked build and
  upload with `setTimeout`, and no COOP/COEP headers exist anywhere in this
  repo, so `crossOriginIsolated` is false in production and it could never have
  booted at all.
  Two corrections worth recording. dev-auth's 182 tests **are** running under
  `pnpm test` — an earlier conclusion that they were silently skipped was wrong,
  and was settled by making one fail on purpose; the `@nx/vitest` executor just
  prints no summary for that project. And `apps/dev-auth/vitest.config.ts` does
  exist; an `ls` that said otherwise had run from a stale working directory.

- **2026-08-13** — Built the Cloud section (spec 005) on
  `feature/005-cloudflare-account`, four commits, one PR. DevFlare had never
  called the account API: `projects` was a hand-typed table, `deployments` was
  written by nobody, and `deploy.page.ts` faked its upload with a `setTimeout`.
  Now `/api/v1/cloud/*` reads Workers, Pages, D1, KV and R2 with a token that
  stays server-side, gated on being an administrator because that token sees
  the whole account.
  Three things only running the app revealed, none of which the build catches:
  routing is a manual table so the four new pages were compiled and unreachable
  until registered (AGENTS.md claimed file-based routing and was corrected); a
  `server/lib/projects.ts` breaks the Nitro dev server for every route while
  building fine, hence `project-rows.ts`; and the projects API was already
  broken by the `{ rows }` envelope, so phase 4 had to fix the list before it
  could link anything to it.
  `@org/core` also got a `test` target — CONVENTIONS.md had asked for colocated
  specs in a project that had no runner to execute them.
  Verified against the real account on 2026-08-14 once the owner created the
  token: 15 Workers, 10 Pages projects, 9 D1, 2 KV, 7 R2, deployment history and
  a working project link. Three mapping bugs only real data could show — D1's
  list endpoint reports `num_tables: 0` for everything, every Pages project here
  is a direct upload rather than git-connected (so Deploy correctly never
  appears), and wrangler-uploaded Worker versions carry no message, so the list
  was leading with raw uuids. Rollback renders but has not been fired.
- **2026-08-12** — Registered imageryx, then made the whole registry editable
  without a deploy (specs 001–004, all Done). Findings that mattered more than
  the code: imageryx was **not registered at all** — both its URIs returned
  `invalid_client`, so there was nothing to "add to"; and the verification
  command in the request used `curl -I`, which 404s on this endpoint even for a
  working client, so it could never have shown the truth.
  The registry now resolves config first, D1 second: config clients cannot be
  shadowed or edited, so the panel cannot rewrite the client it signs in with.
  GitHub credentials and the signup allowlist moved to D1 too, the GitHub secret
  sealed with AES-GCM. The allowlist needed care the clients did not — an empty
  `SIGNUP_ALLOWLIST` means "unrestricted", which is wrong as the failure mode of
  a database read, so it now fails closed. That was observed for real: before
  migration 0005 was applied, sign-ups correctly refused.
  Two bugs the tests caught before they shipped: the GitHub secret fell back to
  the env var when it could not be decrypted (a botched key rotation would have
  looked successful), and the settings memo was not keyed on the env values it
  falls back to. Verified end to end in a browser: an app created from Settings
  → Identity authorizes on both its redirect URIs immediately, with no redeploy.
  182 dev-auth tests, 24 DevFlare tests.

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
