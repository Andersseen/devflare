# CONTEXT — What DevFlare is and why it exists

> Audience: AI agents and new contributors. This file explains purpose and goals,
> not implementation. For implementation see [ARCHITECTURE.md](ARCHITECTURE.md).

## Purpose

This repository ("the DevFlare repo") holds four products for one developer's
own work, all on Cloudflare:

- **DevFlare** (`apps/devflare`) — a **personal project hub**. Every project,
  where it runs (Pages, Workers), where its code lives, what deployed last; a
  project detail page as the central surface; a Cloud section with the raw
  account infrastructure behind it. Authenticated.
- **DevTools** (`apps/devtools`) — **browser-first developer utilities**: QR
  codes, SEO preview, JSON⇄CSV, screen recording, OG images, palettes,
  background removal, link aliases. Anonymous, client-side, static.
- **DevAuth** (`apps/dev-auth` + `libs/shared/dev-auth-*`) — a **standalone
  identity provider** (OAuth 2.1 / OIDC) and its consumer SDK. DevFlare is one
  registered client; apps in other repositories on other domains are others.
  Treat it as a separate product — no DevFlare-specific assumptions in it.
- **Cloudflare Connect** (`apps/cloudflare-connect`) — placeholder for a
  future delegated Cloudflare authorization broker. Not implemented.

Until spec 018 (2026-09-24) the utilities lived inside DevFlare, which made the
app read as a toolbox. They were split out so each product has one purpose.
Image-asset tools (compression, SVG optimisation) belong to **Imageryx**, a
separate repository.

## Why it exists (three goals, in priority order)

1. **Product**: a hub the owner actually uses to see and operate their
   projects, and a clean, privacy-friendly set of utilities next to it.
2. **Reference architecture / showcase**: demonstrate a modern 2026 Angular stack —
   AnalogJS 2 (file-based routing, SSR/prerender via Nitro), Angular 21
   standalone components with signals, Tailwind CSS 4, Nx 22 monorepo —
   deployed Cloudflare-native.
3. **Dogfooding the author's ecosystem**: the proving ground for
   `@voltui/components` (the author's Angular UI kit), `@andersseen/web-components`
   (Stencil web components, used in dev-auth pages), and **flowview**
   (the author's Rust HTML template compiler, consumed here as the
   `@flowview/compiler` WASM build + `@flowview/runtime`, driving dev-auth's
   pages).

## Product principles (use these to resolve design questions)

- **One purpose per app**: project/infrastructure capability → DevFlare;
  generic browser utility → DevTools; image-asset capability → Imageryx.
- **Client-side first**: if a tool can run fully in the browser, it must.
- **No accounts required for tools**: DevTools never depends on DevAuth.
- **Zero-cost infra bias**: everything targets Cloudflare free tiers (Workers, D1,
  KV, Pages). Avoid dependencies that require a paid always-on server.
- **Small, composable, boring**: prefer the platform (fetch, web APIs, SQLite) over
  heavy frameworks or state libraries.

## Who works on it

Solo project by **andersseen** (Andrii Papierovyi, andriipap01@gmail.com). MIT
licensed, public repo. There is no team process beyond `feature/*` → PR → `main`;
optimize for maintainability by one person plus AI agents.
