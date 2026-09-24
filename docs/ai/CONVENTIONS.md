# CONVENTIONS — How code is written here

> Read before writing or editing any code. When in doubt, copy the style of the
> nearest existing file — `apps/devtools/src/app/pages/qr-generator.page.ts`
> is the canonical page example.

## Angular (apps/devflare, apps/devtools, libs/shared/\*)

- **Standalone components only.** Never create an NgModule. Imports go in the
  `imports: []` array of `@Component`.
- **Pages** (`*.page.ts` under `src/app/pages/`):
  - `export default class XxxPage` — the default export is required by AnalogJS.
  - Selector prefix `app-`, e.g. `app-qr-generator-page`.
  - Single file: inline `template:` with Tailwind classes. No separate `.html`/`.css`.
  - Keep pages thin: state (signals) + event handlers that delegate to a
    service — `@org/core` in DevFlare, a colocated
    `apps/devtools/src/app/tools/<slug>.service.ts` in DevTools.
- **Routing**: use AnalogJS file-based routing via `provideFileRouter()`.
  Layouts live as route-group pages such as `(app).page.ts`; redirects and
  guards live in each page's `routeMeta`. Do not add a manual route table.
- **State**: `signal()` / `computed()` / `effect()`. Do not introduce RxJS
  subjects/observables for component state; RxJS only where a library forces it.
- **DI**: `inject()` function; private services as ECMAScript private fields:
  `#qrGeneratorService = inject(QrGenerator);`
- **Two-way binding**: Volt components support `[(value)]="mySignal"`. Native
  elements use `[ngModel]="sig()"` + `(ngModelChange)="sig.set($event)"`
  (import `FormsModule`).
- **UI kit**: use `@voltui/components` (`VoltCard`, `VoltButton`, `VoltInput`,
  `VoltTabs`, …) before writing custom markup; icons via `lucide-angular`
  (`<lucide-icon name="download" />`). Shared in-repo pieces go to `@org/ui`.
- **Services**: `@Injectable({ providedIn: 'root' })`.
  - DevFlare platform services live in `libs/shared/core` (`@org/core`),
    exported from `src/index.ts`.
  - DevTools tool services live next to the tools in
    `apps/devtools/src/app/tools/`, one per tool, with a colocated spec. Pure
    logic — no DOM/component coupling beyond what the tool needs (canvas
    elements are passed in as arguments). New tools are registered in
    `tool-registry.ts` (see the `new-tool` skill).
- **App boundaries**: an app never imports another app. DevFlare and DevTools
  share only `domain:shared` libraries (`@org/ui` primitives and
  `libs/shared/ui/src/styles/theme.css` tokens); each keeps its own shell.
- **SSR/prerender safety**: never touch `window`, `document`, `navigator` or
  `localStorage` during render — guard with `typeof window !== 'undefined'`
  or do it in an event handler / `afterNextRender`. DevTools' build fails on
  a page that throws while prerendering.

## Server code (apps/devflare/src/server)

- h3 handlers: `export default defineEventHandler(async (event) => { … })`.
- Auth-gated endpoints start with:
  ```ts
  const session = await getAppSession(event); // src/server/lib/session.ts
  const user = requireAuth(session);
  ```
  `user.id` is the identity provider's `sub`. The session itself is DevFlare's —
  established by the OIDC flow in `api/auth/callback.ts`, never by asking dev-auth
  on each request.
- Database access only via the `db.sql` tagged-template API — values are always
  interpolated as `${x}` (parameterized), never concatenated into SQL strings.
- Errors: `throw createError({ statusCode, statusMessage })`.
- New API routes go under `src/server/routes/api/v1/…` (file path = URL path).

## Server code (apps/devtools/src/server)

Same h3 + `db.sql` rules, with DevTools' own guards (spec 020):

- Connected endpoints: `const user = await requireAllowedUser(event)` from
  `lib/http.ts` — 401 when anonymous, 403 when not in `DEVTOOLS_ALLOWED_USERS`.
  Signed in is never enough on its own.
- Mutations first call `assertSameOriginJson(event)` (CSRF) and
  `enforceRateLimit(event, '<LIMITER>', user.id)`.
- Decisions live in h3-free modules under `lib/` (tested over the real
  migrations with `db/sqlite-test-db.ts`); routes stay thin adapters.
- Anything that fetches a user-supplied URL goes through
  `lib/domain-inspector/probe.ts` — never a bare `fetch(userInput)`.
- Local tools never call the server. If a tool can run in the browser, it does.

## dev-auth (apps/dev-auth)

- Page HTML lives in `.flow` templates; the compiled `.flow.js` is **generated —
  never edit it**, but it _is_ committed, because the page wrappers import it.
  After editing a `.flow`, run `pnpm --filter @devflare/dev-auth build:flow` and
  commit the regenerated `.flow.js`. The compiler is `@flowview/compiler` (npm,
  WASM), so this works anywhere `pnpm install` has run.
- `.flow` files use `@andersseen/web-components`: `<and-card>`, `<and-input>`,
  `<and-button>`, `<and-icon>` plus attribute-driven layout (`and-layout=`,
  `and-text=`, `and-motion=`). Client-side behavior is a plain inline
  `<script>(function(){…})()</script>` block at the bottom — no framework.
- The component API is **pinned by version** in `pages/layout.ts` (`CDN`), not
  `@latest`. When bumping it, re-check the bits that have already bitten:
  `and-input` emits `andInputChange` (read `input.value` instead of listening),
  toast types are `default|success|error|info|warning`, and `and-button` has no
  `full` prop — full width comes from `and-button[data-full]::part(button)`.
- Anything the pages load from unpkg must be listed in **both** `script-src` and
  `style-src` in `middleware/security-headers.ts`, or the CSP silently drops it.
- Hono routes/middleware: keep each concern in its own file under `routes/` or
  `middleware/`. Validation helpers in `src/lib/validation.ts` (has tests —
  extend them when you extend validation).
- Any schema change = new SQL file in `src/db/migrations/` + matching edit to
  `src/db/schema.ts`. Never edit an already-applied migration.

## Naming & files

- Files: kebab-case. Suffixes: `.page.ts` (routes), `.component.ts`,
  `.service.ts`, `.spec.ts` (colocated tests), `.flow` (templates).
- Classes: PascalCase; tool services are named after the tool (`QrGenerator`).

## Quality gates

- **Formatting**: Prettier (repo-wide, enforced in CI via `format:check`).
- **Lint**: ESLint flat config (`eslint.config.mjs`). Pre-commit hook already
  runs prettier+eslint on staged files; don't bypass with `--no-verify`.
- **Tests**: Vitest. New logic in `@org/core` or `dev-auth/src/lib` should get a
  colocated `*.spec.ts`. UI pages don't require tests; services do.
- **Full gate**: `pnpm check` = format:check + lint + typecheck + test + build.

## Git

- Branches: `feature/<slug>` (also seen: `feature/update-app`). PRs into `main`.
- Commits: short conventional prefix — `feat: …`, `fix: …`, `chore: …`.
- Never commit: `.env`, `.dev.vars`, `data/*.db` changes, `dist/`, `.wrangler/`.

## Anti-patterns (do not introduce)

- NgModules, constructor injection, `any` types to silence errors.
- New global state libraries (NgRx etc.) — signals + services suffice.
- Server-side calls to third-party APIs from local tool pages. (Connected
  DevTools tools may fetch server side, through the SSRF-safe probe only.)
- Tool code in DevFlare or `@org/core`.
- DevAuth, D1 or any server call from a **local** DevTools tool, or from the
  DevTools shell (only `connected` tools may use them).
- Generic filler tools in DevTools (Base64, UUID, lorem ipsum, hash, regex…).
- Hand-written SQL string concatenation.
- Editing generated `.flow.js`, `dist/`, or `.nx/` content.
