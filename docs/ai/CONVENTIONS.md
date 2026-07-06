# CONVENTIONS — How code is written here

> Read before writing or editing any code. When in doubt, copy the style of the
> nearest existing file — `apps/devflare/src/app/pages/tools/qr-generator.page.ts`
> is the canonical page example.

## Angular (apps/devflare, libs/shared/\*)

- **Standalone components only.** Never create an NgModule. Imports go in the
  `imports: []` array of `@Component`.
- **Pages** (`*.page.ts` under `src/app/pages/`):
  - `export default class XxxPage` — the default export is required by AnalogJS.
  - Selector prefix `app-`, e.g. `app-qr-generator-page`.
  - Single file: inline `template:` with Tailwind classes. No separate `.html`/`.css`.
  - Keep pages thin: state (signals) + event handlers that delegate to a
    `@org/core` service.
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
- **Services** (`libs/shared/core`): `@Injectable({ providedIn: 'root' })`, one
  service per tool in `src/lib/services/tools/`, exported from `src/index.ts`.
  Pure logic — no DOM/component coupling beyond what the tool needs (canvas
  elements are passed in as arguments).

## Server code (apps/devflare/src/server)

- h3 handlers: `export default defineEventHandler(async (event) => { … })`.
- Auth-gated endpoints start with:
  ```ts
  const session = await getRemoteSession(event);
  const user = requireAuth(session);
  ```
- Database access only via the `db.sql` tagged-template API — values are always
  interpolated as `${x}` (parameterized), never concatenated into SQL strings.
- Errors: `throw createError({ statusCode, statusMessage })`.
- New API routes go under `src/server/routes/api/v1/…` (file path = URL path).

## dev-auth (apps/dev-auth)

- Page HTML lives in `.flow` templates; the compiled `.flow.js` is **generated —
  never edit it** (`*.flow.js` is gitignored in `apps/dev-auth/.gitignore`).
  After editing a `.flow`, run `pnpm --filter @devflare/dev-auth build:flow`.
- `.flow` files use `@andersseen/web-components`: `<and-card>`, `<and-input>`,
  `<and-button>`, `<and-icon>` plus attribute-driven layout (`and-layout=`,
  `and-text=`, `and-motion=`). Client-side behavior is a plain inline
  `<script>(function(){…})()</script>` block at the bottom — no framework.
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
- Server-side calls to third-party APIs from tool pages (tools are client-side).
- Hand-written SQL string concatenation.
- Editing generated `.flow.js`, `dist/`, or `.nx/` content.
