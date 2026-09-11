import { Hono } from 'hono';

/**
 * Cloudflare Connect: the future deployable home for delegated Cloudflare
 * infrastructure authorization (OAuth scopes, tokens, grant revocation for
 * R2/D1/Workers/etc — see README.md).
 *
 * This is an architectural boundary placeholder, not the broker itself. No
 * OAuth flow, no token persistence, no D1 schema, no Cloudflare API calls —
 * see docs/specs/013-dev-auth-modular-architecture.md for what belongs here
 * once that is actually built, and why it must stay a separate deployable
 * service from dev-auth rather than a feature bolted onto it.
 */

export interface Env {
  ENVIRONMENT?: string;
}

const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) =>
  c.json({
    status: 'ok',
    service: 'cloudflare-connect',
    environment: c.env.ENVIRONMENT ?? 'unknown',
  }),
);

export default app;
