# DevFlare

> A modern developer tools platform built with AnalogJS, Angular 21, and an Nx monorepo.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [AnalogJS 2.4](https://analogjs.org) (file-based routing, SSR) |
| UI Library | [Angular 21](https://angular.dev) · Standalone Components |
| Components | [@voltui/components](https://volt-ui.andersseen.dev) |
| Styling | [Tailwind CSS 4](https://tailwindcss.com) |
| Monorepo | [Nx 22](https://nx.dev) |
| Auth | [better-auth](https://better-auth.com) |
| Database | [Drizzle ORM](https://orm.drizzle.team) + SQLite |
| Build | [Vite 7](https://vite.dev) |
| Testing | [Vitest](https://vitest.dev) + [Playwright](https://playwright.dev) |
| Package Manager | [pnpm](https://pnpm.io) |

## Project Structure

```
devflare/
├── apps/
│   ├── devflare/          # Main AnalogJS application
│   │   └── src/app/
│   │       ├── pages/     # File-based routes (AnalogJS)
│   │       ├── components/ # Layout, sidebar
│   │       └── app.config.ts
│   ├── devflare-e2e/      # Playwright E2E tests
│   └── frontend/          # Secondary Angular app
├── libs/
│   ├── deploy/            # Deployment library
│   └── shared/
│       ├── auth/          # Auth service (better-auth)
│       ├── core/          # Guards, interceptors, services
│       └── ui/            # Shared UI components
├── package.json
├── nx.json
└── tsconfig.base.json
```

## Prerequisites

- Node.js 20+
- pnpm 9+

```bash
npm install -g pnpm
```

## Getting Started

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm start
# → http://localhost:5173
```

## Scripts

```bash
pnpm start                # Dev server (devflare app)
pnpm build                # Build for development
pnpm build:prod           # Build for production
pnpm test                 # Run all unit tests
pnpm lint                 # Lint all projects
pnpm typecheck            # Type check all projects
pnpm graph                # View Nx dependency graph
pnpm affected:test        # Test only affected projects
pnpm affected:lint        # Lint only affected projects
pnpm affected:build       # Build only affected projects
```

### Individual project commands

```bash
npx nx serve devflare           # Dev server
npx nx build devflare           # Build
npx nx test devflare            # Unit tests
npx nx e2e devflare-e2e         # E2E tests
npx nx lint devflare            # Lint
npx nx typecheck devflare       # Type check
```

## Path Aliases

Configured in `tsconfig.base.json`:

| Alias | Source |
|---|---|
| `@org/ui` | `libs/shared/ui` |
| `@org/core` | `libs/shared/core` |
| `@org/auth` | `libs/shared/auth` |
| `@org/deploy` | `libs/deploy` |

## Features

- **Image tools** — compression, background removal, palette generation
- **Web utilities** — OG image generator, QR code generator
- **Deploy** — project deployment management
- **Auth** — sign in / sign up via better-auth
- **Responsive sidebar** — collapsible on desktop, slide-over on mobile (volt-ui)

## Architecture

- **File-based routing** via AnalogJS — pages live in `src/app/pages/`
- **Standalone components** — no NgModules
- **Nx module boundaries** — ESLint rules enforce clean dependency graph
- **Signals** — Angular 21 reactive primitives throughout
- **Compound UI** — `@voltui/components` replaces custom shared/ui components

## Contributing

1. Branch off `main`: `git checkout -b feature/my-feature`
2. Make changes and run quality checks:
   ```bash
   pnpm affected:lint
   pnpm affected:test
   pnpm affected:build
   ```
3. Open a pull request

## License

[MIT](LICENSE) © [andersseen](https://github.com/andersseen)
