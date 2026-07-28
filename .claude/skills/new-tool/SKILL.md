---
name: new-tool
description: Scaffold a new DevFlare browser tool end to end — @org/core service + spec, the page component, and all four registration points (barrel export, router, shell navigation catalog, lucide icon).
disable-model-invocation: true
---

# New tool

Adds a client-side tool to DevFlare: **3 new files** (service, spec, page) plus
**4 registration edits** (barrel, route, catalog, icon). The registrations are
the ones that get forgotten — a page with no route entry is simply unreachable,
and an unregistered lucide icon renders as empty space with no error.

## Arguments

The user gives a tool name and a one-line purpose, e.g.
`/new-tool json-formatter — pretty-print and validate JSON`.

Derive:

- `slug` — kebab-case, used for the file name and the URL (`json-formatter`)
- `ClassName` — PascalCase service name, named after the tool, **no `Service`
  suffix** (`JsonFormatter` — match `QrGenerator`, not `QrGeneratorService`)
- `Title` — display name for the UI (`JSON Formatter`)
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
the tool actually needs (`VoltInput`, `VoltTabs`, a canvas, a file drop zone…).

## Ground rules

Read `docs/ai/CONVENTIONS.md` before writing. In short: standalone components,
signals only, `inject()` as `#private` fields, `export default class` for pages,
inline Tailwind template, `@voltui/components` before custom markup. All tool
logic runs **in the browser** — never add a server route for a tool.

## Steps

**1. Service** → `libs/shared/core/src/lib/services/tools/<slug>.service.ts`

Use `templates/service.ts.template`. Pure logic, no DOM coupling beyond what the
tool needs; canvas/file elements are passed in as arguments by the page.

**2. Spec** → `libs/shared/core/src/lib/services/tools/<slug>.service.spec.ts`

Use `templates/service.spec.ts.template`. Services require tests (pages do not).
Cover the real transformation and at least one malformed input.

> **Heads up:** `libs/shared/core` has no `test` target yet, so this spec will
> not actually run — `pnpm exec nx show projects --with-target test` lists only
> `auth`, `dev-auth`, `devflare`. Still write it; see step 0 of the
> `test-writer` agent for how to wire the target when you want it executing.

**3. Barrel export** → `libs/shared/core/src/index.ts`

Append under the `// Tool Services` block:

```ts
export * from './lib/services/tools/<slug>.service';
```

Without this the page cannot import from `@org/core`.

**4. Page** → `apps/devflare/src/app/pages/tools/<slug>.page.ts`

Use `templates/page.ts.template`. Keep it thin: signals for state, handlers that
delegate to the service. Copy the two-column layout from
`apps/devflare/src/app/pages/tools/qr-generator.page.ts` (controls left, preview
right) unless the tool needs something else.

**5. Route** → `apps/devflare/src/app/app.routes.ts`

Routing is **explicit**, not file-based — `provideRouter(appRoutes)` in
`app.config.ts`. Add inside the same children array as the other tools:

```ts
{
  path: 'tools/<slug>',
  loadComponent: () => import('./pages/tools/<slug>.page'),
},
```

**6. Catalog entry** → `apps/devflare/src/app/components/shell-navigation.ts`

This one entry drives the home grid, the `/tools` grid **and** the sidebar link —
they are all derived from `TOOLS`. Do not edit `(home).page.ts` or
`sidebar.component.ts`; they no longer hold per-tool markup.

Add to the `TOOLS` array, picking a Tailwind color not already used by a
neighbour:

```ts
{
  title: '<Title>',
  description: '<one sentence, ends with a period>',
  link: '/tools/<slug>',
  icon: '<icon>',
  colorClass: 'text-<color>-500',
  bgClass: 'bg-<color>-500/10',
},
```

Add `navLabel` only if `title` is too long for the sidebar (compare against the
neighbours — `'QR Code Studio'` ships `navLabel: 'QR Generator'`).

**7. Register the icon** → `apps/devflare/src/app/app.config.ts`

Icons are explicitly picked, not bundled wholesale:
`LucideAngularModule.pick({ … })`. An unregistered `<icon>` renders as nothing —
silently, with no build error. Import the PascalCase name from `lucide-angular`
and add it to the `pick({ … })` object.

## Verify before reporting done

```
pnpm format:write && pnpm lint && pnpm typecheck && pnpm test
```

Then confirm all four registration points are wired:

```
grep -rn "<slug>" libs/shared/core/src/index.ts apps/devflare/src/app/app.routes.ts apps/devflare/src/app/components/shell-navigation.ts
```

Three hits expected — one per file — plus the icon in `app.config.ts`, which is
keyed by icon name rather than slug:

```
grep -n "<IconName>" apps/devflare/src/app/app.config.ts
```

Report the route the user can now open (`/tools/<slug>`) and anything you had to
guess. The tool should appear in the home grid, at `/tools`, and in the sidebar
under the DevTools section without any further edits.
