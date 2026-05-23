# Contributing to DevFlare

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Prerequisites

- **Node.js**: `>= 20.0.0` (see `.nvmrc`)
- **pnpm**: `>= 9.0.0`
- **Git**: latest stable

## Getting Started

1. Fork the repository
2. Clone your fork
3. Install dependencies:
   ```bash
   pnpm install
   ```

## Development Workflow

### Running Locally

```bash
# Run both services (auth + app)
pnpm dev:all

# Or run separately
pnpm dev:auth  # Auth service on :8787
pnpm dev:app   # DevFlare app on :4200
```

### Seed Test Data

```bash
pnpm seed:user
```

Default test credentials:

- Email: `test@devflare.com`
- Password: `TestPass123`

## Code Quality

Before submitting a PR, ensure all checks pass:

```bash
# Run the full CI pipeline locally
pnpm check

# Or run individual checks
pnpm format:check  # Prettier formatting
pnpm lint          # ESLint
pnpm typecheck     # TypeScript
pnpm test          # Unit tests
pnpm build         # Production build
```

### Pre-commit Hooks

This project uses Husky + lint-staged. On every commit:

- Changed files are auto-formatted with Prettier
- Changed files are auto-fixed with ESLint

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(auth): add OAuth providers
fix(proxy): resolve origin header issue
docs(readme): update setup instructions
test(e2e): add login flow tests
```

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes with tests
3. Run `pnpm ci` locally
4. Push and open a PR against `main`
5. Ensure CI checks pass
6. Request review from code owners

## Project Structure

```
apps/
  devflare/        # Main frontend (AnalogJS + Angular)
  dev-auth/        # Auth service (Hono + better-auth)
  devflare-e2e/    # Playwright E2E tests
libs/
  shared/auth/     # Shared auth client
  shared/core/     # Core utilities
  shared/ui/       # UI components
```

## Reporting Issues

- Use GitHub Issues
- Provide reproduction steps
- Include environment details (Node.js version, OS, etc.)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
