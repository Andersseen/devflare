# 018 — Split DevTools out of DevFlare; refocus DevFlare on projects

| Field   | Value                                         |
| ------- | --------------------------------------------- |
| Status  | Done (code); DevTools deployment is follow-up |
| Branch  | `feature/split-devtools-app`                  |
| Created | 2026-09-24                                    |
| Updated | 2026-09-24                                    |

## 1. Summary

The browser utilities move out of the DevFlare app into a new standalone app,
`apps/devtools`, in the same monorepo. DevFlare's navigation, home page and
project detail are refocused on a single purpose: a personal project hub.
No new tools, no new platform features, no DevAuth or Cloudflare Connect work.

The owner's brief for this phase was the approval for this spec.

## 2. Problem / Motivation

DevFlare had become "developer tools + Cloudflare + projects + SDK demo". Its
navbar had three peer sections (Deployment, DevTools, DevAuth SDK), `@org/core`
mixed platform logic with eight tool services, and the README sold it as a
toolbox. The tools need no account and no server, yet shipped inside an
authenticated SSR Worker — including a ~23 MB ONNX WASM asset for background
removal. Three tool links in DevFlare's own navigation (`/tools/converter`,
`/tools/recorder`, `/tools/shortener`) pointed at pages that did not exist.

## 3. Goals & Non-goals

**Goals**

- `apps/devtools`: anonymous, browser-first, prerendered static app hosting
  every existing generic utility — moved, not copied.
- Tool logic out of `@org/core`; `@org/core` = DevFlare platform logic.
- DevFlare nav = Projects + Cloud (+ Settings in the footer); one external
  DevTools link; no individual tools; SDK showcase out of nav.
- DevFlare home centred on projects; project detail as the central surface.
- Nx `domain:devtools` boundary; scripts, CI, docs, README updated.

**Non-goals**

- New tools (JWT, Base64, cron, regex, hashes…), new DevFlare features
  (analytics, logs, health, alerts, GitHub, queues, DOs), Cloudflare Connect,
  DevAuth changes, deploying DevTools to a domain.

## 4. Design

**Placement rule.** Generic browser developer utility → DevTools. Image-asset
capability → Imageryx (Image Compressor, SVG Optimizer already moved in PR #34;
not recreated). Project/infrastructure capability → DevFlare.

**Inventory moved (8):** SEO Simulator, QR Code Studio, URL Shortener, Data
Converter, Screen Recorder, Social Card Designer, Cinematic Palette,
Background Remover. Background Remover stays a DevTools tool (STATE.md recorded
it as deliberately kept when the image tools left); it is the first candidate
to revisit if Imageryx grows background removal.

**Ownership.** Services moved to `apps/devtools/src/app/tools/` (option A —
colocated). No `libs/devtools/core`: no two pages share a service.

**DevTools app.** Analog `static: true`; prerender routes come from
`tool-registry.ts`; a post-render hook marks a route without `<h1>` as failed
and `failOnError` fails the build, so an SSR crash cannot ship. No DevAuth, no
HTTP client, no Sentry, no bindings. Own shell (header + tool strip), teal
accent over the shared tokens.

**Routes.** Clean root URLs named after the page files:

| Old DevFlare URL                            | DevTools URL       |
| ------------------------------------------- | ------------------ |
| `/tools`                                    | `/`                |
| `/tools/qr-generator`                       | `/qr-generator`    |
| `/tools/seo-simulator`                      | `/seo-simulator`   |
| `/tools/data-converter`, `/tools/converter` | `/data-converter`  |
| `/tools/screen-recorder`, `/tools/recorder` | `/screen-recorder` |
| `/tools/og-generator`                       | `/og-generator`    |
| `/tools/palette`                            | `/palette`         |
| `/tools/bg-remover`                         | `/bg-remover`      |
| `/tools/url-shortener`, `/tools/shortener`  | `/url-shortener`   |
| anything else under `/tools/`               | `/`                |

DevFlare's Worker serves these as 302s when the runtime var `DEVTOOLS_URL` is
set, else redirects to `/`. The navbar link uses the build-time
`VITE_DEVTOOLS_URL` (dev default `http://localhost:4300`). No production
DevTools domain is assumed anywhere.

**Shared UI.** Only design tokens were extracted
(`libs/shared/ui/src/styles/theme.css`); shells stay per app.

## 5. Constraints

- DevAuth, its SDK and `apps/cloudflare-connect` code untouched (READMEs only
  gained a one-line purpose statement).
- Existing DevFlare/DevAuth deploy workflows unchanged.

## 6. Test plan

- Unit: tool registry ↔ pages consistency; tool services; legacy redirect
  mapping; DevFlare nav has no tools/SDK; latest-deployment derivation.
- Build: `nx build devtools` prerenders all 9 routes; verified that a page
  touching `window` in a constructor fails the build.
- E2E: `devtools-e2e` (home, every tool from home + direct load, no errors, no
  `/api` calls, converter round trip, QR download); `devflare-e2e` (no tool
  pages).
- Manual: redirects against the built Worker with `wrangler dev` (dev and
  production env); signed-in walk of Projects, project detail, Cloud.

## 7. Tasks

- [x] Create `apps/devtools` (+ e2e), move pages/services/shim with `git mv`
- [x] Prerender safety net; SSR guards in QR page and URL shortener history
- [x] Trim `@org/core`; drop tool aliases/icons from DevFlare
- [x] DevFlare nav, home, project detail, Cloud copy
- [x] Legacy `/tools/*` redirect, `DEVTOOLS_URL` / `VITE_DEVTOOLS_URL`
- [x] Nx `domain:devtools` rule; root scripts; shared theme tokens
- [x] README, app READMEs, ARCHITECTURE/CONTEXT/CONVENTIONS/WORKFLOWS, skills
- [ ] Follow-up: DevTools domain + deploy job; then set both DevTools vars

## 8. Verification results

See the 2026-09-24 entry in [STATE.md](../ai/STATE.md).

## 9. Log / Deviations

- Nitro's `failOnError` alone did not catch a render crash: Angular's
  ErrorHandler logs it and the route still returns 200. Added the `<h1>` hook.
- The redirect route cannot be E2E-tested on the dev server (Analog forwards
  only `/api/*` to Nitro in dev); verified on the built Worker instead.
- Found and fixed in passing: `folder`/`file` icons used by the R2 bucket
  browser were never registered.
