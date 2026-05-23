# DevFlare Auth

A standalone authentication microservice built with **Hono**, **Better Auth**, and **Cloudflare D1**. Designed to be framework-agnostic and reusable across multiple applications.

## Features

- 🔐 **Email & Password Authentication** — Secure sign-up, sign-in, and session management
- 🗄️ **Cloudflare D1** — Serverless SQLite database for users and sessions
- 🎨 **Web Components UI** — Built with `@andersseen/web-components` (Stencil)
- ☁️ **Cloudflare Setup Wizard** — Guided deployment at `/setup`
- 🚀 **Framework Agnostic** — Use with Angular, React, Vue, or any frontend
- 🔒 **Rate Limiting** — Built-in protection against brute force attacks

## Tech Stack

| Layer     | Technology                              |
| --------- | --------------------------------------- |
| Framework | Hono                                    |
| Auth      | Better Auth                             |
| Database  | Cloudflare D1 (SQLite)                  |
| UI        | `@andersseen/web-components`            |
| Layout    | `@andersseen/layout` (attribute-driven) |
| Deploy    | Cloudflare Workers                      |

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Cloudflare account (free tier works)
- Wrangler CLI: `npm install -g wrangler`

### Local Development

```bash
# Install dependencies
pnpm install

# Start the auth service
nx serve dev-auth
# or
wrangler dev --local
```

The service will be available at `http://localhost:8787`.

### Environment Variables

Create `apps/dev-auth/.dev.vars` for local secrets:

```
BETTER_AUTH_SECRET=your-super-secret-key-change-in-production
```

For production, set via Wrangler:

```bash
wrangler secret put BETTER_AUTH_SECRET
```

## API Endpoints

| Endpoint                  | Method | Description                       |
| ------------------------- | ------ | --------------------------------- |
| `/health`                 | GET    | Service health check              |
| `/api/auth/sign-up/email` | POST   | Register new user                 |
| `/api/auth/sign-in/email` | POST   | Sign in                           |
| `/api/auth/sign-out`      | POST   | Sign out                          |
| `/api/auth/get-session`   | GET    | Get current session               |
| `/api/setup/d1`           | POST   | Create D1 database (setup wizard) |

## Integration with DevFlare

### 1. Set the Auth Service URL

In your DevFlare app, set the `DEV_AUTH_URL` environment variable:

```bash
# Development
DEV_AUTH_URL=http://localhost:8787

# Production
DEV_AUTH_URL=https://auth.yourdomain.com
```

### 2. Vite Proxy (Development Only)

DevFlare's `vite.config.ts` already includes a proxy for `/api/auth`:

```ts
server: {
  proxy: {
    '/api/auth': {
      target: process.env['DEV_AUTH_URL'] ?? 'http://localhost:8787',
      changeOrigin: true,
    },
  },
}
```

### 3. Production Setup

For production, deploy both services to subdomains of the same domain:

- `https://auth.yourdomain.com` — DevFlare Auth
- `https://app.yourdomain.com` — DevFlare App

This ensures cookies work correctly with `SameSite=Lax`.

## Deployment

### Using the Setup Wizard

1. Open `http://localhost:8787/setup` (or your deployed URL)
2. Follow the 5-step wizard:
   - **Intro** — Requirements check
   - **Account** — Enter Cloudflare Account ID and API Token
   - **D1** — Create a D1 database
   - **Config** — Download `wrangler.toml`
   - **Deploy** — Run the final commands

### Manual Deployment

```bash
# 1. Create D1 database
wrangler d1 create dev-auth-db

# 2. Apply migrations
wrangler d1 migrations apply dev-auth-db --remote

# 3. Set secrets
wrangler secret put BETTER_AUTH_SECRET

# 4. Deploy
wrangler deploy
```

## Project Structure

```
apps/dev-auth/
├── src/
│   ├── index.ts              # Hono app entry point
│   ├── auth.config.ts        # Better Auth configuration
│   ├── db/
│   │   ├── schema.ts         # Drizzle schema
│   │   ├── index.ts          # Database connection
│   │   └── migrations/       # D1 migrations
│   ├── routes/
│   │   ├── auth.ts           # Better Auth mount
│   │   └── setup.ts          # Cloudflare setup API
│   ├── pages/
│   │   ├── layout.ts         # Base HTML layout
│   │   ├── login.ts          # Login page
│   │   ├── signup.ts         # Sign-up page
│   │   ├── forgot.ts         # Password reset page
│   │   ├── setup.ts          # Setup wizard page
│   │   └── not-found.ts      # 404 page
│   ├── middleware/
│   │   ├── cors.ts           # CORS configuration
│   │   ├── session.ts        # Session validation
│   │   └── rate-limit.ts     # Rate limiting
│   └── lib/
│       └── validation.ts     # Input validation helpers
├── wrangler.toml             # Cloudflare Worker config
├── .dev.vars                 # Local secrets (gitignored)
└── README.md
```

## Security Notes

- **BETTER_AUTH_SECRET**: Must be a strong, random string in production
- **API Tokens**: Never stored on the server; only used during setup wizard requests
- **Rate Limiting**: 10 requests per minute per IP on auth endpoints
- **CORS**: Configurable via `DEV_AUTH_CORS_ORIGINS` environment variable

## License

MIT

## Testing the Full Flow

### 1. Start the Auth Service

```bash
nx serve dev-auth
# or
cd apps/dev-auth && wrangler dev --local
```

Service runs at: `http://localhost:8787`

### 2. Create a Test User (Optional)

With the auth service running:

```bash
# Using the seed script
npx tsx apps/dev-auth/scripts/seed-test-user.ts

# Or manually via curl
curl -X POST http://localhost:8787/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"email":"test@devflare.com","password":"TestPass123","name":"Test User"}'
```

Default test credentials:

- **Email**: `test@devflare.com`
- **Password**: `TestPass123`

### 3. Start DevFlare

```bash
nx serve devflare
```

App runs at: `http://localhost:4200`

### 4. Test the Flow

1. Open `http://localhost:4200`
2. Click **Sign In** (sidebar or redirect)
3. Enter test credentials
4. You should be redirected back to DevFlare dashboard
5. Access **Projects** — should work with authenticated user
6. Try creating a project

### 5. Test Auth Service Directly

```bash
# Login
curl -X POST http://localhost:8787/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"test@devflare.com","password":"TestPass123"}' \
  -c cookies.txt

# Get session
curl http://localhost:8787/api/auth/get-session -b cookies.txt

# Access projects from DevFlare backend (simulated)
curl http://localhost:4200/api/v1/projects \
  -b cookies.txt
```
