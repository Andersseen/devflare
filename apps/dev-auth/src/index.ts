import { Hono } from 'hono';
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
  COOKIE_DOMAIN?: string;
  DEV_AUTH_CORS_ORIGINS?: string;
  RATE_LIMIT_KV?: KVNamespace;
  ENVIRONMENT?: string;
  SENTRY_DSN?: string;
  ADMIN_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
}

const app = new Hono<{ Bindings: Env }>();

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
app.use('/api/auth/*', createRateLimitMiddleware(10, 60 * 1000));
app.route('/api/auth', authRoutes);

// Setup API — disabled in production
app.route('/api/setup', setupRoutes);

// Admin API — protected by secret token
app.route('/api/admin', adminRoutes);

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
