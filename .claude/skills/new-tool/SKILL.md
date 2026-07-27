---
name: new-tool
description: Scaffold a new DevFlare browser tool end to end — @org/core service + spec, the page component, and all four registration points (barrel export, router, home grid, sidebar).
disable-model-invocation: true
---

# New tool

Adds a client-side tool to DevFlare. A tool is **six** files, and the three
registration points at the end are the ones that get forgotten — a page with no
route entry is simply unreachable.

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

**6. Home card** → `apps/devflare/src/app/pages/(home).page.ts`

Add to the tools array, picking a Tailwind color not already used by a neighbour:

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

**7. Sidebar link** → `apps/devflare/src/app/components/sidebar.component.ts`

```html
<volt-sidebar-item routerLink="/tools/<slug>" label="<Title>">
  <lucide-icon slot="icon" name="<icon>" class="w-5 h-5" />
</volt-sidebar-item>
```

## Verify before reporting done

```
pnpm format:write && pnpm lint && pnpm typecheck && pnpm test
```

Then confirm all four registration points are wired:

```
grep -rn "<slug>" libs/shared/core/src/index.ts apps/devflare/src/app/app.routes.ts "apps/devflare/src/app/pages/(home).page.ts" apps/devflare/src/app/components/sidebar.component.ts
```

Four hits expected — one per file. Report the route the user can now open
(`/tools/<slug>`) and anything you had to guess.
