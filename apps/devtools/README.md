# DevTools (`apps/devtools`)

**Purpose: browser-first developer utilities.** Small tools you would otherwise
hunt for across ad-filled websites — and that should never need your data to
leave the tab.

DevTools is one of four products in this repository (see the root
[README](../../README.md)). It is **not** part of DevFlare, the project hub, and
the two apps do not import each other — Nx boundaries enforce it
(`domain:devtools` may only depend on `domain:devtools` and `domain:shared`).

## Rules that define this app

- **Runs in the browser.** Every tool does its work client-side. No uploads,
  no DevTools API, no server round-trips. If a tool genuinely needs a server,
  it does not belong here.
- **Anonymous.** No account, no DevAuth, no session. Nothing here asks who you
  are.
- **Static and cheap.** `pnpm nx build devtools` prerenders every route to
  HTML; `wrangler.toml` serves the output as static assets with no Worker
  script, no bindings, no D1/KV/R2/queues.
- **No clones.** It hosts the tools that already existed; it is not meant to
  grow a catalogue of generic converters (JWT, Base64, cron, regex, hashes…).
- **Image-asset work belongs to Imageryx**, not here. Image Compressor and SVG
  Optimizer already moved there (PR #34). Background Remover stays for now — a
  one-shot, in-browser utility rather than asset management — and is the first
  candidate to revisit if Imageryx grows that capability.

## Tools

| Category | Tool                 | Route              |
| -------- | -------------------- | ------------------ |
| Web      | SEO Simulator        | `/seo-simulator`   |
| Web      | QR Code Studio       | `/qr-generator`    |
| Web      | URL Shortener        | `/url-shortener`   |
| Data     | Data Converter       | `/data-converter`  |
| Media    | Screen Recorder      | `/screen-recorder` |
| Media    | Social Card Designer | `/og-generator`    |
| Media    | Cinematic Palette    | `/palette`         |
| Media    | Background Remover   | `/bg-remover`      |

Known limitation: the URL Shortener only drafts aliases — they are kept in the
browser and point at a `/s/<alias>` path nothing serves. It behaved the same
inside DevFlare; the page now says so.

Background Remover downloads its model (`@imgly/background-removal`) from the
library's CDN on first use and ships a ~23 MB ONNX runtime WASM file as a
static asset. The image itself never leaves the browser.

## Layout

```
apps/devtools/
├── src/app/
│   ├── app.config.ts          # zoneless, file router, icons — no auth, no HTTP client
│   ├── components/shell.component.ts   # header, tool strip, footer
│   ├── pages/                 # one *.page.ts per tool + (home) + not-found
│   └── tools/
│       ├── tool-registry.ts   # the one list: home grid, nav, prerender routes
│       └── *.service.ts(+spec) # tool logic, colocated (not in @org/core)
├── shims/papaparse.server.mjs # prerender-only stub, see vite.config.ts
├── vite.config.ts             # static: true, prerender + <h1> check
└── wrangler.toml              # assets only; no route/domain yet
```

Adding a tool: use the `new-tool` skill (`.claude/skills/new-tool`).

## Run

```bash
pnpm dev:tools            # http://localhost:4300 — needs nothing else running
pnpm nx test devtools     # unit tests
pnpm nx build devtools    # prerenders every route; fails on an SSR crash
pnpm nx e2e devtools-e2e  # Playwright, starts the dev server itself
pnpm cf:tools dev         # preview the built static site with wrangler
```

## Deployment

Not deployed yet. There is no custom domain and no CI deploy job — both are a
follow-up (docs/specs/018-split-devtools-app.md). Once DevTools has a URL, set
it on DevFlare as `DEVTOOLS_URL` (runtime var: old `/tools/*` links redirect)
and `VITE_DEVTOOLS_URL` (build-time: the navbar link).
