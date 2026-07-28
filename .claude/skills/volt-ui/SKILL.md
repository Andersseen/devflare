---
name: volt-ui
description: >
  Understand and integrate Volt UI components into Angular projects.
  Volt UI is an Angular component library inspired by shadcn/ui, built on
  ng-primitives, Tailwind CSS v4, standalone signals components and CVA.
  Use when the project consumes @voltui/components, @voltui/cli, or copied
  Volt UI source under src/app/ui.
---

# Volt UI — AI Integration Skill

> ## ⚠️ How DevFlare consumes Volt — read this before anything below
>
> Upstream this skill documents two consumption modes and defaults to the CLI
> one. **DevFlare uses the npm package mode.** Where the two disagree, this
> block wins:
>
> - Import from `'@voltui/components'`. There is no `src/app/ui` directory.
> - Selectors are `volt-*` / `[voltXxx]`, classes are `VoltXxx`.
>   **Never generate `<ui-card>` / `UiCard` for this repo.**
> - The theme is **not** wired with `provideVoltTheme()`. It lives in
>   `apps/devflare/src/styles.css`, which imports
>   `@voltui/components/themes.css` and then overrides the palette with
>   DevFlare's own slate/indigo tokens.
> - Volt keys `dark:` off a `.dark` class; this app is driven by
>   `prefers-color-scheme`. `styles.css` redeclares the `dark` variant to accept
>   both. Do not "fix" this by adding a `.dark` toggle.
>
> ### The `@source` trap (this already broke the app once)
>
> Tailwind v4 does not scan `node_modules`. Every utility used _inside_ a Volt
> template is purged unless `@voltui/components/themes.css` is imported — it
> carries the `@source '../fesm2022'` that makes Tailwind scan the bundle.
> Without it the build stays green while `md:relative`, `w-72` and `bg-surface`
> silently vanish, leaving the sidebar `position: fixed` with no width.
>
> If Volt components ever render structurally wrong, check the built CSS first:
>
> ```bash
> grep -c 'md\\:relative' dist/apps/devflare/client/assets/*.css
> ```
>
> Same trap applies to tokens: a utility like `text-surface-foreground` only
> exists if `--color-surface-foreground` is declared in an `@theme` block.

## When to use this skill

- The user is adding, editing or debugging Volt UI components in an Angular app.
- You see imports from `'@voltui/components'`, `'./ui/button'`, etc.
- You need to generate markup, fix selectors, wire Reactive Forms, or theme the app.
- The user asks about available components, CLI commands, or MCP tools.

## What Volt UI is

- **Angular 21**, zoneless, standalone components, OnPush, signals (`input()`, `output()`, `model()`).
- **Tailwind CSS v4** with semantic tokens (`bg-primary`, `text-foreground`, `rounded-md`).
- **ng-primitives** provides accessible behavior (keyboard, focus, overlays, CVA).
- **class-variance-authority (CVA)** drives component variants.
- **Two consumption modes**:
  1. **CLI / source-ownership (recommended)**: `npx @voltui/cli add button`. Files are copied into the consumer project (default `src/app/ui`) and become editable local code.
  2. **NPM package**: `npm install @voltui/components` for shared themes/utilities.

## Naming conventions

| Context        | Selector                                       | Class name | Import path            |
| -------------- | ---------------------------------------------- | ---------- | ---------------------- |
| Library source | `volt-*` (component) / `[voltXxx]` (directive) | `VoltXxx`  | `'@voltui/components'` |
| After CLI copy | `ui-*` (component) / `[uiXxx]` (directive)     | `UiXxx`    | `'./ui/<component>'`   |

**In DevFlare, always use the library row** — `volt-*` / `VoltXxx` imported from
`'@voltui/components'`. The CLI row does not apply to this repo.

## Adding components to this project

```bash
npx @voltui/cli init              # scaffolds src/app/ui
npx @voltui/cli add button card form-field input
npx @voltui/cli add dialog ./src/app/shared/ui --dry-run
```

Runtime dependencies (installed once):

```bash
npm install ng-primitives class-variance-authority clsx tailwind-merge
```

## Theme setup

In the app's global CSS (DevFlare: `apps/devflare/src/styles.css`) — this part
**is** how DevFlare does it, and the import is mandatory (see the `@source` trap
above):

```css
@import 'tailwindcss';
@import '@voltui/components/themes.css';
```

The `provideVoltTheme()` provider below is the upstream default. **DevFlare does
not use it** — the palette is overridden directly in `styles.css`. Shown only so
you recognise it in other projects:

```ts
import { provideVoltTheme } from '@voltui/components';

bootstrapApplication(AppComponent, {
  providers: [provideVoltTheme({ color: 'volt', style: 'sharp', dark: false })],
});
```

Color presets: `volt`, `ember`, `sage`, `dusk`, `glacier`.
Style presets: `sharp`, `soft`, `brutal`, `ghost`, `retro`.

## Component / directive selector rules

- Element selectors are used for presentational containers: `<ui-card>`, `<ui-button>`, `<ui-input>`.
- Attribute directives are used when the primitive is applied to an existing host element:
  - Dialog trigger: `<button [uiDialog]="tpl">`
  - Drawer trigger: `<button [uiDrawer]="tpl">`
  - Popover trigger: `<button uiPopover [uiPopover]="tpl">`
  - Tooltip trigger: `<button uiTooltip [uiTooltip]="tpl">`
  - Dropdown trigger: `<button [uiDropdownMenu]="tpl">`
  - Avatar image: `<img uiAvatarImage>`
  - Navigation link: `<a uiNavigationMenuLink>`
- Overlays (dialog, drawer, popover, tooltip, dropdown-menu) are declared inside an `<ng-template>` and referenced by the trigger.

## Reactive Forms

Most CVA components expose `formControl` directly:

```ts
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { UiInput, UiCheckbox, UiSwitch, UiRadioGroup, UiRadioItem } from './ui';

email = new FormControl('', { nonNullable: true });
accepted = new FormControl(false, { nonNullable: true });
```

```html
<ui-form-field>
  <ui-form-field-label>Email</ui-form-field-label>
  <ui-input [formControl]="email" type="email" />
  <ui-form-field-hint>We'll only use this for account updates.</ui-form-field-hint>
</ui-form-field>

<ui-checkbox [formControl]="accepted">Accept terms</ui-checkbox>
```

## Common patterns

### Card

```html
<ui-card>
  <ui-card-header>
    <ui-card-title>Title</ui-card-title>
    <ui-card-description>Description</ui-card-description>
  </ui-card-header>
  <ui-card-content>Content</ui-card-content>
  <ui-card-footer>
    <ui-button variant="outline">Cancel</ui-button>
    <ui-button>Save</ui-button>
  </ui-card-footer>
</ui-card>
```

### Dialog

```html
<button [uiDialog]="dialogTpl">Open</button>
<ng-template #dialogTpl let-close="close">
  <div uiDialogOverlay></div>
  <div uiDialogContent>
    <h2 uiDialogTitle>Confirm</h2>
    <p uiDialogDescription>Are you sure?</p>
    <ui-button (click)="close()">Confirm</ui-button>
  </div>
</ng-template>
```

### Tabs

```html
<ui-tabs [(value)]="activeTab">
  <ui-tabs-list>
    <ui-tabs-trigger value="account">Account</ui-tabs-trigger>
    <ui-tabs-trigger value="password">Password</ui-tabs-trigger>
  </ui-tabs-list>
  <ui-tabs-content value="account">Account settings.</ui-tabs-content>
  <ui-tabs-content value="password">Password settings.</ui-tabs-content>
</ui-tabs>
```

## AI tools integration

- **MCP server**: `https://volt-ui.pages.dev/api/mcp` is a spec-compliant Streamable HTTP MCP server, already configured in this project's `.mcp.json` by `npx volt-ui-mcp`. It exposes tools, resources, and prompts:
  - Tools: `list_components`, `get_component`, `get_usage_example`, `get_theme_info`, `get_project_info`, `generate_cli_command`.
  - Resources: `component://<name>`, `theme://info`, `project://info`.
  - Prompts: `generate-volt-ui-component`, `volt-ui-troubleshooting`.
- **CLI**: `npx @voltui/cli list` shows available components; `npx @voltui/cli add <name>` copies source.
- Prefer calling the MCP `get_component` tool over guessing inputs — this file lists the common patterns, but the MCP server always reflects the current component metadata.

## Rules for generating Volt UI code

1. Prefer standalone components with signal inputs; avoid NgModules.
2. Use OnPush change detection in new components that extend Volt UI.
3. **DevFlare: import from `'@voltui/components'`.** (Upstream default is
   `'./ui/<component>'` for CLI-copied source; that does not apply here.)
4. Use semantic Tailwind utilities (`bg-primary`, `text-foreground`, `rounded-md`) instead of hard-coded `var()` utilities.
5. Boolean inputs must use `booleanAttribute`; number inputs should use `numberAttribute` when appropriate.
6. For overlays, always use the attribute-directive trigger + `<ng-template>` pattern.
7. Do not invent inputs. If unsure, call the MCP `get_component` tool.
