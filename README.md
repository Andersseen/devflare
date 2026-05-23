# DevFlare

> A modern developer tools platform built with AnalogJS, Angular 21, and an Nx monorepo.

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Copy environment sample and fill in your values
cp .env.sample .env

# 3. Start both services
pnpm dev:all

# 4. Seed test user (in another terminal)
pnpm seed:user
```

Open http://localhost:4200 and login with:

- Email: `test@devflare.com`
- Password: `TestPass123`

## Tech Stack

| Layer           | Technology                                                          |
| --------------- | ------------------------------------------------------------------- |
| Framework       | [AnalogJS 2.4](https://analogjs.org) (file-based routing, SSR)      |
| UI Library      | [Angular 21](https://angular.dev) · Standalone Components           |
| Components      | [@voltui/components](https://volt-ui.andersseen.dev)                |
| Styling         | [Tailwind CSS 4](https://tailwindcss.com)                           |
| Monorepo        | [Nx 22](https://nx.dev)                                             |
| Auth            | [better-auth](https://better-auth.com) + [Hono](https://hono.dev)   |
| Auth DB         | [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite)     |
| App DB          | [db0](https://github.com/unjs/db0) + SQLite                         |
| Build           | [Vite 7](https://vite.dev)                                          |
| Testing         | [Vitest](https://vitest.dev) + [Playwright](https://playwright.dev) |
| Package Manager | [pnpm](https://pnpm.io)                                             |

## Project Structure

```
devflare/
├── apps/
│   ├── devflare/          # Main AnalogJS application (developer tools)
│   │   └── src/app/
│   │       ├── pages/     # File-based routes (AnalogJS)
│   │       ├── components/ # Layout, sidebar
│   │       └── app.config.ts
│   ├── dev-auth/          # Standalone auth microservice (Hono + better-auth + D1)
│   │   ├── src/
│   │   │   ├── pages/     # Login, signup, forgot-password UI
│   │   │   ├── routes/    # API routes
│   │   │   └── db/        # D1 schema and migrations
│   │   └── wrangler.toml  # Cloudflare Workers config
│   └── devflare-e2e/      # Playwright E2E tests
├── libs/
│   ├── deploy/            # Deployment library
│   └── shared/
│       ├── auth/          # Shared auth client (better-auth)
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

## Quick Start

### Install dependencies

```bash
pnpm install
```

### Start both services

```bash
# Option 1: Same terminal (with colored output)
pnpm dev:all

# Option 2: macOS — separate Terminal windows
./scripts/dev-macos.sh

# Option 3: Manual — separate terminals
# Terminal 1: pnpm dev:auth   → http://localhost:8787
# Terminal 2: pnpm dev:app    → http://localhost:4200
```

### Create a test user

With the auth service running:

```bash
pnpm seed:user
```

Default test credentials:

- **Email**: `test@devflare.com`
- **Password**: `TestPass123`

### Test the full flow

1. Open **DevFlare App**: http://localhost:4200
2. Click **Sign In** in the sidebar
3. Enter test credentials → you are redirected back to DevFlare
4. Try creating a **Project** — it will be linked to your authenticated user

### Test the auth service directly

```bash
# Login
curl -X POST http://localhost:8787/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:8787" \
  -d '{"email":"test@devflare.com","password":"TestPass123"}' \
  -c cookies.txt

# Get session
curl http://localhost:8787/api/auth/get-session -b cookies.txt
```

## Available Scripts

| Script           | Description                    |
| ---------------- | ------------------------------ |
| `pnpm dev:auth`  | Start auth service (port 8787) |
| `pnpm dev:app`   | Start DevFlare app (port 4200) |
| `pnpm dev:all`   | Start both services together   |
| `pnpm seed:user` | Create test user in auth DB    |
| `pnpm start`     | Start DevFlare app only        |
| `pnpm build`     | Build DevFlare app             |
| `pnpm test`      | Run all tests                  |
| `pnpm lint`      | Run ESLint                     |
| `pnpm typecheck` | Run TypeScript checks          |

## Auth Architecture

DevFlare uses a **standalone auth microservice** (`apps/dev-auth`) that can be deployed independently:

- **Development**: Vite proxies `/api/auth/*` from DevFlare to the auth service
- **Production**: Both services run on subdomains of the same domain (e.g., `auth.yourdomain.com` + `app.yourdomain.com`)

See `apps/dev-auth/README.md` for deployment instructions.

## Development Guidelines

- **VOLTUI** for UI components in `apps/devflare`
- **@andersseen/web-components** for auth pages in `apps/dev-auth`
- AnalogJS file-based routing (`.page.ts` files)
- Standalone Angular components (no NgModules)
- Signals over RxJS where possible

## License

MIT
