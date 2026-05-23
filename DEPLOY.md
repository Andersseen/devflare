# Production Deployment Guide

This guide walks you through deploying DevFlare to production.

## Architecture

```
┌─────────────────┐      ┌─────────────────┐
│   DevFlare App  │◄────►│  DevAuth Service│
│  (Cloudflare    │      │  (Cloudflare    │
│   Pages/Vercel) │      │   Workers + D1) │
└─────────────────┘      └─────────────────┘
```

## Prerequisites

- [Cloudflare account](https://dash.cloudflare.com)
- [Node.js 20+](https://nodejs.org) and [pnpm 9+](https://pnpm.io)
- GitHub repository with Actions enabled

## 1. Cloudflare Resources

### 1.1 Create D1 Database (Production)

```bash
cd apps/dev-auth
npx wrangler d1 create dev-auth-db-prod
```

Copy the `database_id` from the output and update `wrangler.toml`:

```toml
[[env.production.d1_databases]]
binding = "DB"
database_name = "dev-auth-db-prod"
database_id = "your-real-database-id-here"
```

### 1.2 Create KV Namespace (Rate Limiting)

```bash
npx wrangler kv:namespace create "RATE_LIMIT_KV"
npx wrangler kv:namespace create "RATE_LIMIT_KV" --env production
```

Update `wrangler.toml` with the production KV namespace ID.

### 1.3 Apply Migrations

```bash
npx wrangler d1 migrations apply dev-auth-db --env production --remote
```

## 2. Secrets

Set the following secrets via Wrangler or GitHub Actions:

### Via Wrangler CLI

```bash
cd apps/dev-auth

# Auth secret (generate a strong random string)
# openssl rand -base64 32
npx wrangler secret put BETTER_AUTH_SECRET --env production

# Cloudflare API token (for GitHub Actions)
# Create at: https://dash.cloudflare.com/profile/api-tokens
# Required permissions: Cloudflare Workers Edit, D1 Edit, KV Edit
```

### GitHub Repository Secrets

Go to **Settings → Secrets and variables → Actions** and add:

| Secret                  | Description                                    |
| ----------------------- | ---------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | API token with Workers, D1, and KV permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID                     |

## 3. Environment Variables

### DevAuth Service (`wrangler.toml`)

Update production variables:

```toml
[env.production.vars]
BETTER_AUTH_URL = "https://auth.yourdomain.com"
COOKIE_DOMAIN = ".yourdomain.com"
DEV_AUTH_CORS_ORIGINS = "https://app.yourdomain.com"
ENVIRONMENT = "production"
```

### DevFlare App

Update `apps/devflare/.env.production`:

```bash
DEV_AUTH_URL=https://auth.yourdomain.com
```

## 4. Domain Configuration

### Auth Service (Cloudflare Workers)

Add a custom domain in the Cloudflare dashboard:

1. Go to **Workers & Pages**
2. Select your worker
3. Go to **Triggers → Custom Domains**
4. Add `auth.yourdomain.com`

### Frontend (Cloudflare Pages / Vercel)

Deploy the built `dist/apps/devflare` folder to your preferred platform.

## 5. Deploy

### Manual Deploy

```bash
# Deploy auth service
cd apps/dev-auth
npx wrangler deploy --env production

# Build frontend
pnpm nx build devflare --configuration production
```

### Automatic Deploy (GitHub Actions)

Push to `main` triggers the deploy workflow automatically.

## 6. Post-Deploy Verification

```bash
# Health checks
curl https://auth.yourdomain.com/health
curl https://app.yourdomain.com/api/health

# Test login flow
curl -X POST https://auth.yourdomain.com/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"test@devflare.com","password":"TestPass123"}'
```

## 7. Optional Features

### GitHub OAuth

1. Create a GitHub OAuth App: https://github.com/settings/applications/new
2. Set Authorization callback URL to: `https://auth.yourdomain.com/api/auth/callback/github`
3. Set secrets:
   ```bash
   npx wrangler secret put GITHUB_CLIENT_ID --env production
   npx wrangler secret put GITHUB_CLIENT_SECRET --env production
   ```

### Email Verification

Email verification is enabled by default. In production, integrate with Resend:

```bash
pnpm add resend
```

Update `auth.config.ts`:

```ts
import { Resend } from 'resend';

emailVerification: {
  sendVerificationEmail: async ({ user, url }) => {
    const resend = new Resend(env.RESEND_API_KEY);
    await resend.emails.send({
      from: 'auth@yourdomain.com',
      to: user.email,
      subject: 'Verify your email',
      html: `<a href="${url}">Verify email</a>`,
    });
  },
},
```

### Analytics

Track events from the frontend:

```ts
fetch('/api/analytics/event', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ event: 'page_view', path: '/projects' }),
});
```

View events (admin only):

```bash
curl -H "Authorization: Bearer $ADMIN_SECRET" \
  https://auth.yourdomain.com/api/analytics/events
```

## 8. Security Checklist

- [ ] `BETTER_AUTH_SECRET` is a strong random string (32+ chars)
- [ ] `BETTER_AUTH_URL` points to HTTPS domain (not localhost)
- [ ] `DEV_AUTH_CORS_ORIGINS` is explicitly set (no wildcards)
- [ ] `COOKIE_DOMAIN` matches your root domain
- [ ] D1 database has migrations applied
- [ ] KV namespace is created for rate limiting
- [ ] `/api/setup/*` endpoints return 403 in production
- [ ] `ENVIRONMENT=production` is set
- [ ] `ADMIN_SECRET` is set for protected endpoints
- [ ] GitHub secrets are set (if using OAuth)

## Troubleshooting

### "Invalid origin" errors

Ensure `BETTER_AUTH_URL` matches the domain you're accessing the service from.

### Cookies not persisting

Check `COOKIE_DOMAIN` is set to your root domain (e.g., `.yourdomain.com`).

### D1 migration errors

Run migrations manually:

```bash
npx wrangler d1 migrations apply dev-auth-db --env production --remote
```
