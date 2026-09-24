# DevTools (`apps/devtools`)

**A short, curated set of developer tools we actually use.** Few tools, high
quality — not a catalogue of generic converters.

DevTools is one of four products in this repository (see the root
[README](../../README.md)). It is **not** part of DevFlare, the project hub,
and the two apps never import each other (Nx `domain:*` tags). Design and
rationale: [spec 020](../../docs/specs/020-devtools-connected-foundation.md)
(this phase) and [spec 018](../../docs/specs/018-split-devtools-app.md) (the
split from DevFlare).

## Two kinds of tool

| Mode          | Runs where                                  | Account                              | Your input                              |
| ------------- | ------------------------------------------- | ------------------------------------ | --------------------------------------- |
| **Local**     | Entirely in the browser                     | None                                 | Never leaves the tab; no request at all |
| **Connected** | DevTools' Worker (D1, server-side fetching) | DevAuth sign-in + DevTools allowlist | Sent to DevTools' own server only       |

`mode` is a property in `src/app/tools/tool-registry.ts`, separate from the
category: a tool is e.g. `category: 'web', mode: 'connected'`.

Local tool pages make **no** request to DevTools' server — not even a
session lookup. DevAuth code is loaded only by the connected pages
(`src/app/connected/`). The E2E suite asserts both.

## Tools

| Category | Tool                   | Route               | Mode      |
| -------- | ---------------------- | ------------------- | --------- |
| Web      | SEO Simulator          | `/seo-simulator`    | local     |
| Web      | QR Code Studio         | `/qr-generator`     | local     |
| Web      | cURL ↔ Fetch          | `/curl-converter`   | local     |
| Web      | Short Links            | `/short-links`      | connected |
| Web      | Domain Inspector       | `/domain-inspector` | connected |
| Security | OAuth / OIDC Inspector | `/oauth-inspector`  | local     |
| Security | Security Headers       | `/security-headers` | local     |
| Cloud    | Wrangler Config Doctor | `/wrangler-doctor`  | local     |
| Data     | Data Converter         | `/data-converter`   | local     |
| Media    | Screen Recorder        | `/screen-recorder`  | local     |
| Media    | Social Card Designer   | `/og-generator`     | local     |
| Media    | Cinematic Palette      | `/palette`          | local     |
| Media    | Background Remover     | `/bg-remover`       | local     |

`/url-shortener` (the old draft-only shortener) redirects to `/short-links`.

- **OAuth / OIDC Inspector** — checks an authorization URL (PKCE, state,
  nonce, redirect URI, response type, duplicates, leaked secrets) citing the
  RFC each rule comes from; decodes a JWT with readable times and **never**
  claims the signature is verified; generates a PKCE verifier and derives /
  checks the S256 challenge with Web Crypto.
- **Wrangler Config Doctor** — `wrangler.toml` (`smol-toml`) or
  `wrangler.json(c)` (`jsonc-parser`). Missing/invalid `compatibility_date`,
  duplicate binding names (vars included), sections and bindings not
  inherited by `[env.*]`, missing required fields, empty/placeholder ids,
  secrets in `vars`, unknown keys. Generates an `Env` interface only for
  bindings with a one-to-one `@cloudflare/workers-types` type. The rule tables
  are tested against `node_modules/wrangler/config-schema.json`, so a Wrangler
  upgrade that changes them fails the tests.
- **Security Headers** — pasted headers through the shared analyzer
  (`src/app/tools/security-headers.analyzer.ts`): present / missing /
  potentially weak / informational, with context. No score.
- **cURL ↔ Fetch** — a POSIX-shell lexer for curl (quotes, `$'…'`,
  continuations) and an `acorn` AST with literal-only evaluation for
  `fetch(…)`. Anything that cannot be translated is a warning or an explicit
  "unsupported", never a silent guess.
- **Short Links** — personal short links on `SHORT_LINK_BASE_URL`; public
  302 redirects, 410 when disabled, 404 when unknown. No analytics.
- **Domain Inspector** — DNS over HTTPS, the redirect chain (manual, max 5
  hops), final response headers through the same analyzer, CDN hints. No
  TLS certificate details: Workers `fetch` does not expose them.

Inputs that look like secrets (bearer tokens, JWTs, client secrets, cookies,
known key formats) get a notice; the input itself is never modified.

## DevAuth authenticates, DevTools authorizes

- DevTools is its **own** OAuth client of DevAuth (`devtools-dev` locally,
  `devtools` in production), Authorization Code + PKCE S256 + OIDC, through
  `@dev-auth/core`. The UI dogfoods `@dev-auth/angular` and
  `<dev-auth-sign-in>` / `<dev-auth-user-button>` from `@dev-auth/elements`.
- After the callback DevTools keeps its **own** session: the `dt_session`
  cookie (HttpOnly, SameSite=Lax, Secure over HTTPS, 7 days), stored hashed
  in DevTools' D1. OAuth tokens are never stored or sent to the browser.
- A DevAuth account is **not** permission. `DEVTOOLS_ALLOWED_USERS` (DevAuth
  user ids, or emails) decides who may use connected tools, checked on the
  server for every connected request. Empty = nobody. Prefer user ids in
  production: DevAuth does not verify email addresses yet.

## Data ownership

| Database                 | Holds                                   |
| ------------------------ | --------------------------------------- |
| DevAuth (`dev-auth-db*`) | Identity                                |
| DevFlare (`devflare-db`) | Projects and infrastructure metadata    |
| DevTools (`devtools-db`) | DevTools' session and short links, only |

Migrations: `src/server/db/migrations/`. No click or browsing history is
stored; Domain Inspector keeps nothing.

## Layout

```
apps/devtools/
├── src/app/
│   ├── components/         # shell, connected gate, header findings, …
│   ├── connected/          # DevAuth wiring + same-origin API client (connected pages only)
│   ├── pages/              # one *.page.ts per tool + (home) + not-found + url-shortener redirect
│   └── tools/              # tool-registry.ts + colocated services/specs (pure logic)
├── src/server/
│   ├── db/                 # db0/D1 + migrations + node:sqlite test helper
│   ├── lib/                # oidc, session, authorization, rate-limit, http guards,
│   │   ├── short-links/    #   validation, owner-scoped store, redirect decision
│   │   └── domain-inspector/  # target rules, IP ranges, DoH, SSRF-safe probe
│   ├── middleware/short-link-redirect.ts
│   └── routes/api/         # auth/*, v1/access, v1/short-links/*, v1/domain-inspector
├── vite.config.ts          # Nitro cloudflare-module, every page still prerendered
└── wrangler.toml           # Worker + Assets, D1, rate limiters, vars
```

Adding a tool: use the `new-tool` skill (`.claude/skills/new-tool`). Most tools
should be local; a connected tool needs a reason a browser cannot do it.

## Security notes

- **SSRF** (Domain Inspector): hostnames only (no IP literals, default ports,
  no credentials, no special-use names); every hop — including each redirect
  — is resolved over DoH and refused unless _all_ its addresses are public;
  8 s per hop, 20 s overall, bodies never read. A DNS-rebinding window
  remains between our lookup and the runtime's own; checking every hop
  narrows it, and on Workers the connection leaves Cloudflare's network, not
  a private one.
- **CSRF**: SameSite=Lax session plus a same-origin `Origin` /
  `Sec-Fetch-Site` check and `application/json` on every mutation.
- **Open redirects**: `returnTo` is same-site paths only; short-link
  destinations are absolute http(s) URLs without credentials.
- **Rate limits** (Workers Rate Limiting bindings): sign-in 20/min per IP,
  mutations 60/min and Domain Inspector 10/min per user. The public redirect
  is not limited.

## Run

```bash
pnpm dev:tools            # http://localhost:4300 — local tools need nothing else
pnpm dev:all              # + DevAuth on :8787, needed to sign in to connected tools
pnpm db:migrate:tools:local   # create DevTools' local D1 tables (once)
pnpm nx test devtools     # unit tests (tools, analyzers, server libs)
pnpm nx build devtools    # prerenders every page + builds the Worker
pnpm nx e2e devtools-e2e  # Playwright; DEVTOOLS_E2E_AUTH=1 adds the DevAuth round trip
pnpm cf:tools dev         # run the built Worker locally with wrangler
```

Local sign-in needs `apps/devtools/.dev.vars` with `DEV_AUTH_CLIENT_SECRET`
equal to `OAUTH_CLIENT_SECRETS["devtools-dev"]` in `apps/dev-auth/.dev.vars`
(see `.dev.vars.example`). Locally short links live under
`http://localhost:4300/api/go/<slug>`, because the Analog dev server forwards
only `/api/*` to Nitro.

## Deployment

Not deployed yet, and nothing deploys it automatically. The manual steps —
D1, secrets, DevAuth registration, allowed users, the two domains — are in
[DEPLOY.md › DevTools](../../DEPLOY.md#devtools).
