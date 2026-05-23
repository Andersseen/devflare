import { Hono } from 'hono';

export interface Env {
  DB: D1Database;
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
}

const app = new Hono<{ Bindings: Env }>();

// Health check
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'dev-auth',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  });
});

// Root - redirect to login
app.get('/', (c) => {
  return c.redirect('/login');
});

// Placeholder login page
app.get('/login', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Sign In — DevFlare Auth</title>
        <script type="module" src="https://unpkg.com/@andersseen/web-components@latest/dist/web-components/web-components.esm.js"></script>
        <link rel="stylesheet" href="https://unpkg.com/@andersseen/web-components@latest/dist/web-components/web-components.css" />
        <style>
          :root {
            --primary: 243 75% 59%;
            --background: 226 30% 98%;
            --foreground: 224 71% 4%;
          }
          @media (prefers-color-scheme: dark) {
            :root {
              --primary: 234 89% 74%;
              --background: 229 50% 6%;
              --foreground: 226 100% 97%;
            }
          }
          body {
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: hsl(var(--background));
            color: hsl(var(--foreground));
            font-family: system-ui, -apple-system, sans-serif;
          }
        </style>
      </head>
      <body>
        <and-card style="width: 380px; padding: 2rem;">
          <h1 style="margin: 0 0 1.5rem; font-size: 1.5rem; text-align: center;">DevFlare Auth</h1>
          <p style="text-align: center; color: hsl(var(--foreground) / 0.6);">
            Auth service placeholder. Better-auth integration coming in Phase 1.
          </p>
          <div style="margin-top: 1.5rem; text-align: center;">
            <and-button onclick="window.location.href='/health'">Check Health</and-button>
          </div>
        </and-card>
      </body>
    </html>
  `);
});

export default app;
