---
name: ui-check
description: Launch DevFlare and actually look at it — walk the key routes in a browser, screenshot them, and check the shell renders correctly at desktop and mobile widths. Use after any change to the layout, sidebar, navbar, styles.css or a Volt component.
disable-model-invocation: true
---

# UI check

`pnpm check` passing tells you nothing about whether the app _looks_ right. The
VoltUI regression of 2026-07-28 shipped with format, lint, typecheck, test and
build all green, while the sidebar rendered on top of the main content. This
skill is the missing step.

## Prerequisites

Needs the **Playwright MCP server** (`.mcp.json` → `playwright`). If no
`mcp__playwright__*` tools are available, stop and tell the user to restart
Claude Code — MCP servers are only loaded at startup. Do not fall back to
guessing from the HTML.

## 1. Start the app

```bash
pnpm dev:app
```

Run it in the background. Wait for the port rather than sleeping:

```bash
curl -s --retry-connrefused --retry 40 --retry-delay 2 -o /dev/null \
  -w '%{http_code}\n' http://localhost:4200/
```

Use `pnpm dev:all` instead if the change touches auth — that also brings up
dev-auth on :8787. Test account: `test@devflare.com` / `TestPass123`
(`pnpm seed:user` if it does not exist yet).

**Always stop the server before finishing**, even if the check fails.

## 2. Walk the routes

Minimum set — add any route the change actually touched:

| Route                 | What must be true                              |
| --------------------- | ---------------------------------------------- |
| `/`                   | Hero + card grid; sidebar shows Platform group |
| `/tools`              | Tool grid; sidebar switches to the Tools group |
| `/tools/qr-generator` | Canonical two-column tool page                 |
| `/settings`           | Volt tabs, form fields                         |
| `/login`              | Renders standalone, without the app shell      |

At each route take a screenshot and **look at it**. Then check the console:

```
mcp__playwright__browser_console_messages
```

Report any error or warning. A clean console is part of passing.

## 3. What to look for

Shell integrity — this is where the known failure mode lives:

- Sidebar sits **beside** the content, not on top of it. If it overlaps, suspect
  purged Tailwind utilities (`md:relative`, `w-72`) — see the `@source` trap in
  `.claude/skills/volt-ui/SKILL.md`.
- Sidebar has a real width, and collapsing it (the chevron in its header) moves
  the content edge.
- Navbar tabs: exactly one active underline, and it follows the route.
- Sidebar footer (Settings + version) is pinned to the bottom; only `<main>`
  scrolls.

Volt components: cards have background and padding, focus rings are visible when
tabbing, no unstyled flashes of raw markup.

## 4. Responsive

Check at least 1440×900 and 390×844. At mobile width:

- The sidebar is hidden and opens as a slide-over from the navbar hamburger.
- The overlay closes it, and so does picking an item.
- Nothing scrolls horizontally — the page body must never overflow sideways.

## 5. Dark and light

The app follows `prefers-color-scheme` (there is no in-app toggle). Emulate both
and confirm text stays readable and no element keeps a hardcoded colour that
only works in one theme.

## Reporting

Say plainly what you saw at each route, and attach the screenshots. If something
is wrong, describe the visual symptom **and** name the suspected cause, then
stop — do not fix it in the same pass unless the user asked you to.

If you could not check something (route needs auth, a browser API is
unavailable), say so explicitly. Never report a route as verified when you did
not look at it.
