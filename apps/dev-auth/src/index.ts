import { Hono } from 'hono';
import { createAuth } from './auth.config';
import { withSentry } from './instrument';
import { createCorsMiddleware } from './middleware/cors';
import { createRateLimitMiddleware } from './middleware/rate-limit';
import { securityHeaders } from './middleware/security-headers';
import authRoutes from './routes/auth';
import setupRoutes from './routes/setup';
import adminRoutes from './routes/admin';
import analyticsRoutes from './routes/analytics';
import { renderLoginPage } from './pages/login';
import { renderSignupPage } from './pages/signup';
import { renderForgotPage } from './pages/forgot';
import { renderSetupPage } from './pages/setup';
import { renderNotFoundPage } from './pages/not-found';
import { renderVerifyPage } from './pages/verify';

export interface Env {
  DB: D1Database;
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  DEV_AUTH_CORS_ORIGINS?: string;
  RATE_LIMIT_KV?: KVNamespace;
  ENVIRONMENT?: string;
  SENTRY_DSN?: string;
  ADMIN_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  /** Comma-separated addresses allowed to sign up. Empty means unrestricted. */
  SIGNUP_ALLOWLIST?: string;
  /**
   * JSON array of the applications allowed to authenticate through this
   * service: client id, name, type and redirect URIs. Public information, so it
   * lives in wrangler.toml. See src/oauth-clients.ts.
   */
  OAUTH_CLIENTS?: string;
  /**
   * JSON object mapping client id -> client secret, for confidential clients.
   * A secret: `wrangler secret put OAUTH_CLIENT_SECRETS` (or .dev.vars locally).
   */
  OAUTH_CLIENT_SECRETS?: string;
  /**
   * Default destination for a sign-in that did *not* start from an OAuth
   * authorization request — someone opening /login directly. This service has no
   * landing page of its own (`/` redirects back to `/login`), so without it such
   * a sign-in bounces the user straight back to the form. Authorization flows
   * ignore this and return to the calling application's redirect URI.
   */
  APP_URL?: string;
}

/** Exported for tests; the Worker entry point is the default export below. */
export const app = new Hono<{ Bindings: Env }>();

// Global error handler
app.onError((err, c) => {
  console.error('[Error]', err);
  return c.json(
    {
      error:
        c.env.ENVIRONMENT === 'production'
          ? 'Internal server error'
          : err.message,
    },
    500,
  );
});

// Security headers on all responses
app.use(securityHeaders);

// CORS
app.use(createCorsMiddleware());

// Health check
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'dev-auth',
    version: '0.1.0',
    environment: c.env.ENVIRONMENT || 'development',
    timestamp: new Date().toISOString(),
  });
});

// Auth API — mounts better-auth at /api/auth/*
//
// Two buckets. Credential endpoints stay at 10/min per IP to slow brute force.
// The OAuth provider endpoints need a looser one: token exchanges and JWKS
// fetches arrive from a consumer app's *server*, so one IP carries every user's
// login, and 10/min would throttle real traffic rather than an attacker.
const oauthLimit = createRateLimitMiddleware(60, 60 * 1000);
const credentialLimit = createRateLimitMiddleware(10, 60 * 1000);
const PROVIDER_PREFIXES = [
  '/api/auth/oauth2/',
  '/api/auth/jwks',
  '/api/auth/.well-known/',
];

app.use('/api/auth/*', (c, next) =>
  PROVIDER_PREFIXES.some((prefix) => c.req.path.startsWith(prefix))
    ? oauthLimit(c, next)
    : credentialLimit(c, next),
);

// Dynamic client registration is closed. `allowDynamicClientRegistration: false`
// is NOT enough on its own: better-auth only reads it to decide whether an
// *unauthenticated* caller may register, so with it off any signed-in user could
// still POST here and create a client with redirect URIs of their choosing —
// exactly the thing the registry exists to prevent. Registration is
// configuration (OAUTH_CLIENTS), so the endpoint has no reason to exist.
// Registered before the better-auth mount, which is what makes this win.
app.all('/api/auth/oauth2/register', (c) =>
  c.json(
    {
      error: 'invalid_request',
      error_description:
        'Dynamic client registration is disabled. Clients are registered in configuration.',
    },
    404,
  ),
);

app.route('/api/auth', authRoutes);

// OIDC discovery. The issuer is this service's origin, so standard clients look
// for the document here rather than under the /api/auth base path better-auth
// mounts it on. Serve the same document from both, so there is one source.
app.get('/.well-known/openid-configuration', async (c) => {
  const auth = createAuth(c.env);
  const url = new URL(c.req.url);
  url.pathname = '/api/auth/.well-known/openid-configuration';
  return auth.handler(new Request(url, { headers: c.req.raw.headers }));
});

// Setup API — disabled in production
app.route('/api/setup', setupRoutes);

// Admin API — protected by secret token
app.route('/api/admin', adminRoutes);

// Analytics API
app.route('/api/analytics', analyticsRoutes);

// Auth pages
app.get('/login', (c) => {
  return c.html(renderLoginPage(c.env.APP_URL));
});

app.get('/signup', (c) => {
  return c.html(renderSignupPage(c.env.APP_URL));
});

app.get('/forgot', (c) => {
  return c.html(renderForgotPage());
});

// Setup page
app.get('/setup', (c) => {
  return c.html(renderSetupPage());
});

// Email verification page
app.get('/verify', (c) => {
  const error = c.req.query('error');
  return c.html(renderVerifyPage(error || undefined));
});

// Root — redirect to login
app.get('/', (c) => {
  return c.redirect('/login');
});

// 404 Not Found
app.notFound((c) => {
  return c.html(renderNotFoundPage(), 404);
});

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    return withSentry(request, env, ctx, () => app.fetch(request, env, ctx));
  },
};
