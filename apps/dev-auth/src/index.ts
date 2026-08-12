import { Hono } from 'hono';
import {
  oauthProviderAuthServerMetadata,
  oauthProviderOpenIdConfigMetadata,
} from '@better-auth/oauth-provider';
import { createAuth } from './auth.config';
import { withSentry } from './instrument';
import { createCorsMiddleware } from './middleware/cors';
import { createRateLimitMiddleware } from './middleware/rate-limit';
import { securityHeaders } from './middleware/security-headers';
import authRoutes from './routes/auth';
import setupRoutes from './routes/setup';
import adminRoutes from './routes/admin';
import adminClientRoutes from './routes/admin-clients';
import adminSettingsRoutes from './routes/admin-settings';
import analyticsRoutes from './routes/analytics';
import { renderLoginPage } from './pages/login';
import { renderSignupPage } from './pages/signup';
import { renderForgotPage } from './pages/forgot';
import { renderConsentPage } from './pages/consent';
import { renderSetupPage } from './pages/setup';
import { renderNotFoundPage } from './pages/not-found';
import { renderSignedInPage } from './pages/signed-in';
import { renderVerifyPage } from './pages/verify';

export interface Env {
  DB: D1Database;
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  DEV_AUTH_CORS_ORIGINS?: string;
  RATE_LIMIT_KV?: KVNamespace;
  ENVIRONMENT?: string;
  SENTRY_DSN?: string;
  /** Legacy machine token for /api/admin (backup, stats). Not the client API. */
  ADMIN_SECRET?: string;
  /**
   * Comma-separated addresses allowed to administer the provider: the OAuth
   * client registry and, from spec 003, provider settings. Unlike
   * SIGNUP_ALLOWLIST, empty means *nobody*. See src/lib/admin.ts.
   */
  ADMIN_EMAILS?: string;
  /**
   * Shared secret letting another server of mine call /admin/* back-channel on
   * behalf of a named admin (DevFlare's dashboard). A Worker secret, never a var.
   */
  ADMIN_API_TOKEN?: string;
  /**
   * Key for the few settings that must be stored reversibly rather than hashed
   * — the GitHub client secret. A Worker secret. Without it those values cannot
   * be decrypted and the provider falls back to the config vars.
   * See src/lib/secret-box.ts.
   */
  SECRET_ENCRYPTION_KEY?: string;
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
const PROVIDER_PREFIXES = ['/api/auth/oauth2/', '/api/auth/jwks'];

app.use('/api/auth/*', (c, next) =>
  PROVIDER_PREFIXES.some((prefix) => c.req.path.startsWith(prefix))
    ? oauthLimit(c, next)
    : credentialLimit(c, next),
);

/**
 * Every way the provider plugin can be asked to write a client. Registration is
 * configuration (`OAUTH_CLIENTS`), so none of these has a reason to exist here.
 *
 * Turning the plugin's registration flags off is NOT enough on its own: those
 * only govern the RFC 7591 endpoint, while `/oauth2/create-client` and friends
 * ask merely for a valid *session* — so without this any signed-in user could
 * mint a client with redirect URIs of their choosing, which is exactly what the
 * registry exists to prevent. Registered before the better-auth mount, which is
 * what makes these win.
 *
 * This is the outermost of three independent locks. The other two are
 * `clientPrivileges` (auth.config.ts), which denies the actions, and the
 * configuration-backed client store (client-registry.ts), which has nowhere to
 * write them.
 */
const CLIENT_WRITE_PATHS = [
  '/api/auth/oauth2/register',
  '/api/auth/oauth2/create-client',
  '/api/auth/oauth2/update-client',
  '/api/auth/oauth2/delete-client',
  '/api/auth/oauth2/client/rotate-secret',
];

for (const path of CLIENT_WRITE_PATHS) {
  app.all(path, (c) =>
    c.json(
      {
        error: 'invalid_request',
        error_description:
          'Client registration is disabled. Clients are registered in configuration.',
      },
      404,
    ),
  );
}

app.route('/api/auth', authRoutes);

/**
 * Discovery. The issuer is this service's origin, so a standard client looks for
 * these documents at the root rather than under the /api/auth base path the rest
 * of better-auth is mounted on. The plugin marks both as server-only for exactly
 * this reason and exports the handlers so they can be served where the issuer
 * says they are.
 */
app.get('/.well-known/openid-configuration', async (c) => {
  const auth = await createAuth(c.env);
  return oauthProviderOpenIdConfigMetadata(auth)(c.req.raw);
});

app.get('/.well-known/oauth-authorization-server', async (c) => {
  const auth = await createAuth(c.env);
  return oauthProviderAuthServerMetadata(auth)(c.req.raw);
});

// Setup API — disabled in production
app.route('/api/setup', setupRoutes);

// Admin API — protected by secret token. Machine operations (backup, stats)
// with no acting human; distinct from the client registry API below.
app.route('/api/admin', adminRoutes);

// Client registry administration. Authenticated as a *person*: an admin session
// on this origin, or one of my own servers presenting a service token and naming
// the admin it acts for. See src/lib/admin.ts.
app.route('/admin/clients', adminClientRoutes);

// The provider's own configuration: GitHub credentials, who may sign up. Same
// authorization and the same audit trail as the client registry above.
app.route('/admin/settings', adminSettingsRoutes);

// Analytics API
app.route('/api/analytics', analyticsRoutes);

// Auth pages
app.get('/login', (c) => {
  return c.html(renderLoginPage());
});

app.get('/signup', (c) => {
  return c.html(renderSignupPage());
});

app.get('/forgot', (c) => {
  return c.html(renderForgotPage());
});

/**
 * Consent. Unreachable for every client registered today — they are all my own
 * applications and the registry marks them `skipConsent` — but the provider
 * requires a page to send a user to when a client does need one, and pointing
 * that at a URL this service does not serve would be a latent 404 in the middle
 * of an authorization flow.
 */
app.get('/consent', (c) => {
  return c.html(renderConsentPage());
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

/**
 * The provider's own landing page.
 *
 * This used to redirect to `APP_URL`, which meant a direct sign-in here was
 * really a sign-in to DevFlare — dev-auth serves several applications, and the
 * one that happened to be first is not the answer to "who am I signed in as".
 * So: signed in, this reports the provider session and offers a way out of it;
 * signed out, it sends the browser to the login form. An authorization request
 * never reaches here, because it returns to the redirect URI of the client that
 * started it.
 */
app.get('/', async (c) => {
  const auth = await createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session) return c.redirect('/login');

  return c.html(
    renderSignedInPage({
      email: session.user.email,
      name: session.user.name,
    }),
  );
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
