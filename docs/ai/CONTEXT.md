# CONTEXT — What DevFlare is and why it exists

> Audience: AI agents and new contributors. This file explains purpose and goals,
> not implementation. For implementation see [ARCHITECTURE.md](ARCHITECTURE.md).

## Purpose

DevFlare is a **developer-tools platform**: a single web app that bundles the small
utilities developers usually hunt for across a dozen ad-filled websites — QR code
generation, image compression, background removal, OG-image generation, data format
conversion, color palette extraction, screen recording, SEO preview, SVG
optimization, URL shortening — plus lightweight **project/deployment tracking** for
authenticated users.

## Why it exists (three goals, in priority order)

1. **Product**: a fast, clean, privacy-friendly toolbox. Tools run **in the
   browser** wherever possible (image work, QR, converters) — no uploads, no
   tracking, instant results.
2. **Reference architecture / showcase**: demonstrate a modern 2026 Angular stack —
   AnalogJS 2 (file-based routing + SSR via Nitro), Angular 21 standalone components
   with signals, Tailwind CSS 4, Nx 22 monorepo — deployed Cloudflare-native.
3. **Dogfooding the author's ecosystem**: DevFlare is the proving ground for
   `@voltui/components` (the author's Angular UI kit), `@andersseen/web-components`
   (Stencil web components, used in dev-auth pages), and **flowmark/flowview**
   (the author's Rust-based HTML template compiler + JS runtime, currently being
   adopted for dev-auth pages).

## The two products inside this repo

- **`devflare`** (main app) — the toolbox UI + a small SSR API (projects,
  deployments). This is what end users see at `app.<domain>`.
- **`dev-auth`** — a **standalone, framework-agnostic auth microservice**
  (Hono + better-auth + Cloudflare D1) meant to be reusable across the author's
  projects, not just DevFlare. It has its own UI pages (login/signup/…), its own
  DB, its own deploy target (`auth.<domain>`). Treat it as a separate product that
  happens to live in this monorepo.

## Product principles (use these to resolve design questions)

- **Client-side first**: if a tool can run fully in the browser, it must.
- **No accounts required for tools**: auth gates only the project/deployment
  features, never the utilities.
- **Zero-cost infra bias**: everything targets Cloudflare free tiers (Workers, D1,
  KV, Pages). Avoid dependencies that require a paid always-on server.
- **Small, composable, boring**: prefer the platform (fetch, web APIs, SQLite) over
  heavy frameworks or state libraries.

## Who works on it

Solo project by **andersseen** (Andrii Papierovyi, andriipap01@gmail.com). MIT
licensed, public repo. There is no team process beyond `feature/*` → PR → `main`;
optimize for maintainability by one person plus AI agents.
