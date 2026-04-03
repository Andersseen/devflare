# DevFlare

A modern developer tools platform built with Angular 21 and Nx monorepo architecture.

## Overview

DevFlare is a comprehensive suite of developer tools including:

- Image processing (compression, background removal, palette generation)
- Web utilities (OG image generator, SEO simulator, URL shortener, QR generator)
- Data conversion tools
- Screen recording
- Cloud storage management
- Deployment management with WebContainers

## Tech Stack

- **Frontend**: Angular 21 (Standalone Components)
- **Monorepo**: Nx 22
- **Backend**: Express.js 4 + TypeScript
- **Testing**: Vitest + Playwright
- **Styling**: Tailwind CSS 4
- **Icons**: Lucide Angular
- **Package Manager**: npm

## Project Structure

```
devflare/
├── apps/
│   ├── frontend/          # Main Angular application (DevFlare tools)
│   ├── api/               # Express API backend (port 3333)
│   ├── shop/              # Demo e-commerce app (port 4200)
│   └── shorter-url/       # URL shortener microservice
├── libs/
│   ├── core/              # Core services, guards, interceptors, error handling
│   ├── ui/                # Shared UI components
│   ├── shared/models/     # TypeScript models and interfaces
│   ├── api/products/      # API product service
│   └── shop/              # Shop-specific libraries
└── package.json
```

## Prerequisites

- Node.js 20+
- npm 10+

## Installation

```bash
npm install
```

## Development

### Start Frontend (DevFlare)

```bash
npx nx serve frontend
```

Frontend runs at: http://localhost:4200

### Start API

```bash
npx nx serve api
```

API runs at: http://localhost:3333

### Run Both (with proxy)

```bash
npx nx serve frontend
# Automatically proxies /api requests to localhost:3333
```

### Run Tests

```bash
# Unit tests
npx nx test frontend
npx nx test core

# E2E tests
npx nx e2e shop-e2e

# All tests
npx nx run-many -t test
```

### Lint and Type Check

```bash
npx nx run-many -t lint
npx nx run-many -t typecheck
```

### Build for Production

```bash
npx nx build frontend --configuration production
npx nx build api --configuration production
```

## Configuration

### Environment Variables

Create `.env` file in `apps/api/`:

```bash
cp apps/api/.env.example apps/api/.env
```

Key variables:

- `NODE_ENV` - development/production
- `PORT` - API port (default: 3333)
- `ALLOWED_ORIGINS` - CORS allowed origins
- `JWT_SECRET` - JWT signing secret
- `ENABLE_AUTH` - Enable authentication

### Path Aliases

Unified path aliases (configured in `tsconfig.base.json`):

- `@org/models` - Shared TypeScript models
- `@org/core` - Core services, guards, interceptors, error handling
- `@org/ui` - UI components
- `@org/shop/*` - Shop-specific libraries

## Key Features Implemented

### Frontend (Angular)

- Standalone components (no NgModules)
- Lazy loading for all routes
- Functional guards (`authGuard`, `publicGuard`)
- Functional HTTP interceptors (`authInterceptor`, `errorInterceptor`)
- Global error handler with logging
- Environment configuration
- TypeScript path aliases

### Backend (Express)

- Centralized error handling middleware
- Input validation middleware
- CORS configuration (environment-based)
- Health check endpoint
- Environment configuration with dotenv
- Async/await pattern with error handling

### Code Quality

- ESLint with module boundary rules
- Prettier formatting
- TypeScript strict mode
- Vitest for unit testing
- Playwright for E2E testing

## Architecture Decisions

### 1. Monorepo with Nx

- **Why**: Code sharing, consistent tooling, atomic commits
- **Benefits**:
  - Module boundaries enforced with ESLint tags
  - Build caching for faster development
  - Affected commands for CI optimization

### 2. Standalone Components

- **Why**: Simpler architecture, better tree-shaking
- **Benefits**:
  - No NgModules boilerplate
  - Easier lazy loading with `loadComponent`
  - Better Angular 21+ features support

### 3. Functional Interceptors

- **Why**: Modern Angular pattern
- **Benefits**:
  - Cleaner code than class-based interceptors
  - Better tree-shaking
  - Works with `withInterceptors()`

### 4. Core Library

- **Why**: Centralized shared logic
- **Contains**:
  - Auth service with signals
  - Global error handler
  - Route guards
  - HTTP interceptors
  - Config service

## Module Boundaries (ESLint)

Tags enforce architectural constraints:

| Tag            | Description      | Can Import From              |
| -------------- | ---------------- | ---------------------------- |
| `scope:shared` | Shared libraries | `scope:shared` only          |
| `scope:shop`   | Shop-specific    | `scope:shop`, `scope:shared` |
| `scope:api`    | API-specific     | `scope:api`, `scope:shared`  |
| `type:data`    | Data access      | `scope:shared`               |

## API Endpoints

### Health

- `GET /health` - Health check

### Products

- `GET /api/products` - List products (with filters)
- `GET /api/products/:id` - Get product by ID
- `GET /api/products-metadata/categories` - Get categories
- `GET /api/products-metadata/price-range` - Get price range

### Query Parameters (Products)

- `category` - Filter by category
- `minPrice` - Minimum price
- `maxPrice` - Maximum price
- `inStock` - Filter by stock status
- `searchTerm` - Search term
- `page` - Page number (default: 1)
- `pageSize` - Items per page (default: 12)

## Frontend Routes

### Auth (Public)

- `/auth/sign-in` - Sign in
- `/auth/sign-up` - Sign up

### Dashboard (Protected)

- `/` - Home
- `/tools/compressor` - Image compressor
- `/tools/og-generator` - OG image generator
- `/tools/seo-simulator` - SEO simulator
- `/tools/svg-optimizer` - SVG optimizer
- `/tools/bg-remover` - Background remover
- `/tools/palette` - Palette generator
- `/tools/shortener` - URL shortener
- `/tools/qr-generator` - QR code generator
- `/tools/converter` - Data converter
- `/tools/recorder` - Screen recorder
- `/storage/explorer` - Cloud storage
- `/deploy` - Deploy
- `/deploy/dashboard` - Deployment dashboard
- `/settings` - Settings
- `/settings/cloud` - Cloud credentials

## Available Scripts

```bash
# Development
npx nx serve frontend          # Start frontend
npx nx serve api               # Start API
npx nx serve shop              # Start shop demo

# Building
npx nx build frontend          # Build frontend
npx nx build api               # Build API
npx nx run-many -t build       # Build all

# Testing
npx nx test frontend           # Unit test frontend
npx nx test core               # Unit test core lib
npx nx e2e shop-e2e            # E2E tests
npx nx run-many -t test        # Test all

# Code Quality
npx nx lint frontend           # Lint frontend
npx nx run-many -t lint        # Lint all
npx nx run-many -t typecheck   # Type check all

# Exploration
npx nx graph                   # View dependency graph
npx nx show project frontend   # View project details
```

## Docker

### Build and Run API

```bash
npx nx docker:build api
npx nx docker:run api
```

## CI/CD

GitHub Actions workflow configured in `.github/workflows/ci.yml`:

- Lint
- Test
- Build
- Type check
- E2E tests

## Roadmap

### Phase 1: Foundation (Completed)

- Modern Angular setup
- Nx monorepo structure
- API with Express
- Authentication system
- Error handling
- Environment configuration

### Phase 2: Core Tools (In Progress)

- Image processing tools
- Web utilities
- Data converters
- Screen recording

### Phase 3: Cloud & Deploy (Planned)

- Cloud storage integration (AWS, GCP, Azure)
- WebContainer deployment
- CloudFront CDN integration
- Multi-tenant support

### Phase 4: Advanced Features (Future)

- Real-time collaboration
- Plugin system
- API marketplace
- Team workspaces

## Contributing

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Make your changes
3. Run quality checks:
   ```bash
   npx nx affected:lint
   npx nx affected:test
   npx nx affected:build
   ```
4. Submit PR with description

## License

MIT

## Useful Links

- [Nx Documentation](https://nx.dev)
- [Angular Documentation](https://angular.io)
- [Express.js Documentation](https://expressjs.com)
- [Tailwind CSS Documentation](https://tailwindcss.com)

## Support

For issues and questions:

- Create an issue in the repository
- Check existing documentation
- Review Nx and Angular docs
