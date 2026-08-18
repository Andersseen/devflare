# 009 — Resizable sidebar

| Field   | Value                           |
| ------- | ------------------------------- |
| Status  | In progress                     |
| Branch  | `feature/009-resizable-sidebar` |
| Created | 2026-08-18                      |
| Updated | 2026-08-18                      |

## 1. Summary

The sidebar can be dragged to a width you choose, the way Jira's is, and
remembers it. The drag behaviour comes from `quartz-headless`, which is a new
dependency for this app.

## 2. Problem / Motivation

The sidebar is 288px, always, for everyone. Nested navigation and long resource
names — Pages projects, R2 keys — truncate at that width while the content area
has room to spare.

## 3. Goals & Non-goals

**Goals**

- Drag the divider to resize; keyboard works too (arrows, Home, End).
- The width survives a reload.
- The sidebar can neither disappear nor take over the page.
- Collapsed (Volt's icon rail) and mobile (slide-over) behave exactly as before.

**Non-goals**

- Replacing Volt's sidebar, its collapse toggle, or its mobile behaviour.
- A resizable anything else. One splitter, one place.

## 4. Design

### Where the behaviour comes from

`quartz-headless` ships a splitter as three directives plus a service:
`qzSplitterContainer` (owns `position`, `minSize`, `maxSize`, `step`, measures
the container), `qzSplitterPanel`, and `qzSplitterHandle` (pointer, touch and
keyboard, `role="separator"` with `aria-valuemin/max/now`).

Volt has its own `volt-resizable`. It was not used: it keeps no state — it
writes `width` inline onto its previous sibling — so there is nothing to persist
and no minimum below which it refuses to shrink. A remembered, bounded width
needs a model, and only Quartz has one.

`qzSplitterPanel` is **not** used either. It forces `width: <position>%` inline
along with `min-width: 0` and `max-width: none`, which are exactly the
declarations this feature needs to set itself. The container and the handle are
enough.

### The two problems worth naming

**Volt's sidebar has no width input.** `VoltSidebar` declares no inputs at all
and hardcodes `w-72` (`w-16` collapsed). So `styles.css` overrides it:
`.app-sidebar-panel > app-sidebar > volt-sidebar { width: 100% }` — two elements
deep, which outranks a Tailwind utility class without `!important`. The panel
owns the width; the sidebar fills it.

**Percent versus pixels.** The splitter's position is a percentage, which is
wrong for a sidebar: 18% is cramped on a laptop and absurd on a 34" monitor. So
the percentage drives the width and CSS clamps it in pixels (`min-width: 14rem`,
`max-width: 26rem`). The percent bounds passed to the splitter (8–40) only stop
the drag running away.

The width travels as a **custom property**, not a plain inline style, because a
media query has to be able to ignore it: below `md` the sidebar is a `fixed`
slide-over and the panel must claim no width at all. An inline style could not
be switched off that way.

### Files

| File                                                   | Change                                     |
| ------------------------------------------------------ | ------------------------------------------ |
| `apps/devflare/src/app/components/layout.component.ts` | splitter container, handle, persistence    |
| `apps/devflare/src/styles.css`                         | the panel rules, behind `min-width: 768px` |
| `package.json`                                         | `quartz-headless` ^0.0.5                   |

### Decisions & trade-offs

- **A second UI dependency.** The app had only `@voltui/components`. Accepted
  deliberately by the owner. The tidier end state is Volt's own `volt-resizable`
  rebuilt on Quartz so apps depend on one library, which is work in two other
  repos and not this one's to do.
- **The stored value is the percentage**, since that is what the splitter owns.
  The pixel clamps then keep it sane on any screen.
- **Saved on drag end, not on every move.** `positionChange` fires per pointer
  move; only the last one matters. Keyboard changes arrive outside a drag and
  save immediately.
- **`localStorage` is read synchronously** in the constructor, because the
  splitter takes its starting position once and ignores later input changes.
  Guarded for SSR, where the server renders the default and the browser corrects
  it on hydration — a style attribute, which hydration does not validate.

## 5. Constraints

`docs/ai/CONVENTIONS.md`: standalone components, signals, `inject()`. No change
to any server route or to `@org/core`.

## 6. Test plan

Manual, since this is drag behaviour in a shell component:

1. `/` on a desktop viewport: drag the divider — the sidebar follows, the
   content reflows, and it stops at roughly 224px and 416px.
2. Reload: the width is still there.
3. Focus the divider with Tab, press ← and →: it moves. Home/End jump to the
   bounds.
4. Collapse with Volt's toggle: the rail is 64px and the divider disappears.
5. Narrow the window below 768px: the sidebar becomes the slide-over again and
   leaves no gap where the panel was.

## 7. Tasks

- [x] 1. Add `quartz-headless`.
- [x] 2. Splitter in the layout, width persisted.
- [x] 3. Panel styles and the Volt width override.
- [x] 4. Quality gates.
- [ ] 5. Manual verification (section 6).
- [x] 6. `docs/ai/STATE.md` + the index in `docs/specs/README.md`.

## 8. Verification results

2026-08-18: `tsc --noEmit`, `eslint`, `prettier` and `vitest` (8 files, 107
tests) clean, and `nx build devflare` succeeds — the build is what compiles the
template. The rules land in the built stylesheet as
`@media(min-width:768px){.app-sidebar-panel{width:var(--sidebar-w,18%)…}}`, and
the splitter is in the client bundle.

Not verified: the drag itself, which needs a browser and a pointer.

## 9. Log / Deviations

- **2026-08-18** — The plan started as "build a tree and a splitter in Quartz".
  Reading the library first showed both already exist (`dialog`, `drag-drop`,
  `overlay`, `splitter`, `toast`, `tooltip`, `tree`, `viewport`,
  `virtual-scroll`), so this became integration rather than authoring.
