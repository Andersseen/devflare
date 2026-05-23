import { Hono } from 'hono';
import { createCorsMiddleware } from './middleware/cors';
import authRoutes from './routes/auth';
import setupRoutes from './routes/setup';
import { renderLoginPage } from './pages/login';
import { renderSignupPage } from './pages/signup';
import { renderForgotPage } from './pages/forgot';
import { renderSetupPage } from './pages/setup';

export interface Env {
  DB: D1Database;
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  DEV_AUTH_CORS_ORIGINS?: string;
}

const app = new Hono<{ Bindings: Env }>();

// Global middleware
app.use(createCorsMiddleware());

// Health check
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'dev-auth',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  });
});

// Auth API — mounts better-auth at /api/auth/*
app.route('/api/auth', authRoutes);

// Setup API — Cloudflare setup helpers
app.route('/api/setup', setupRoutes);

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

// Root — redirect to login
app.get('/', (c) => {
  return c.redirect('/login');
});

export default app;
