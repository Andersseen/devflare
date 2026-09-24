---
name: new-tool
description: Scaffold a new DevTools browser utility end to end — colocated service + spec, the page component, the tool-registry entry and the lucide icon. Tools live in apps/devtools, never in DevFlare.
disable-model-invocation: true
---

# New tool

Adds a client-side tool to **DevTools** (`apps/devtools`) — the standalone,
anonymous, static app. DevFlare (`apps/devflare`) is the project hub and must
not grow tools again (docs/specs/018-split-devtools-app.md).

**3 new files** (service, spec, page) plus **2 registration edits** (registry,
icon). The registrations are the ones that get forgotten — and
`tool-registry.spec.ts` fails the test run if a page and the registry disagree.

Before adding one, check the brief still wants it: DevTools deliberately does
not clone generic utilities (JWT decoders, Base64, cron, regex, hashes…), and
image-asset tools belong to Imageryx, not here.

## Arguments

The user gives a tool name and a one-line purpose, e.g.
`/new-tool json-formatter — pretty-print and validate JSON`.

Derive:

- `slug` — kebab-case, used for the page file name **and** the URL
  (`json-formatter` → `/json-formatter`)
- `ClassName` — PascalCase service name, named after the tool, **no `Service`
  suffix** (`JsonFormatter` — match `QrGenerator`)
- `Title` — display name for the UI (`JSON Formatter`)
- `category` — one of `web`, `data`, `media` (see `TOOL_CATEGORIES`)
- `icon` — a valid [lucide](https://lucide.dev/icons) icon name (`braces`)

If any of these is unclear, ask once, then build everything without stopping again.

## Template placeholders

The files in `templates/` use these tokens — replace every one:

| Token             | Meaning               | Example                      |
| ----------------- | --------------------- | ---------------------------- |
| `__SLUG__`        | kebab-case name / URL | `json-formatter`             |
| `__CLASS_NAME__`  | service class         | `JsonFormatter`              |
| `__PASCAL__`      | page class prefix     | `JsonFormatter` → …`Page`    |
| `__CAMEL__`       | private field name    | `jsonFormatter`              |
| `__TITLE__`       | display name          | `JSON Formatter`             |
| `__DESCRIPTION__` | subtitle under the h1 | `Pretty-print and validate…` |

The templates are a starting shape, not a contract — replace the placeholder
`run()` body with the tool's real logic and adjust the Volt components to what
the tool actually needs.

## Ground rules

Read `docs/ai/CONVENTIONS.md` and `apps/devtools/README.md` first. In short:
standalone components, signals only, `inject()` as `#private` fields,
`export default class` for pages, inline Tailwind template. All tool logic
runs **in the browser**: no server route, no API call to a DevFlare backend, no
DevAuth, no D1/KV/R2. Every page must have an `<h1>` and must not touch
`window`/`document`/`navigator` during render — the build prerenders every
tool and fails if a page throws.

## Steps

**1. Service** → `apps/devtools/src/app/tools/<slug>.service.ts`

Use `templates/service.ts.template`. Pure logic; canvas/file elements are passed
in as arguments by the page. Colocated in the app — not in `@org/core`, which is
DevFlare's platform library and which DevTools is not allowed to import.

**2. Spec** → `apps/devtools/src/app/tools/<slug>.service.spec.ts`

Use `templates/service.spec.ts.template`. Services require tests (pages do not).
Cover the real transformation and at least one malformed input. Runs under
`pnpm nx test devtools`.

**3. Page** → `apps/devtools/src/app/pages/<slug>.page.ts`

Use `templates/page.ts.template`. File-based routing: the file name is the URL.
Copy the two-column layout from `apps/devtools/src/app/pages/qr-generator.page.ts`
(controls left, preview right) unless the tool needs something else.

**4. Registry entry** → `apps/devtools/src/app/tools/tool-registry.ts`

One entry drives the home grid, the tool strip in the header **and** the list of
routes prerendered by `vite.config.ts`:

```ts
{
  path: '<slug>',
  title: '<Title>',
  description: '<one sentence, ends with a period>',
  category: '<web|data|media>',
  icon: '<icon>',
  colorClass: 'text-<color>-500',
  bgClass: 'bg-<color>-500/10',
},
```

Add `navLabel` only if `title` is too long for the tool strip.

**5. Register the icon** → `apps/devtools/src/app/app.config.ts`

`LucideAngularModule.pick({ … })` — an unregistered icon renders as nothing,
silently. Import the PascalCase name from `lucide-angular` and add it.

**6. E2E** → add the tool to the `TOOLS` table in
`apps/devtools-e2e/src/tools.spec.ts` (path, card title, h1).

## Verify before reporting done

```
pnpm format:write && pnpm lint && pnpm typecheck && pnpm nx test devtools && pnpm nx build devtools
```

The build step matters: it prerenders the new page and fails on an SSR crash.
Report the route the user can now open (`http://localhost:4300/<slug>` via
`pnpm dev:tools`) and anything you had to guess.
