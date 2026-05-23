import type { Context, Next } from 'hono';

/**
 * Security headers middleware.
 * Applies CSP, HSTS, X-Frame-Options, and other security headers.
 */
export async function securityHeaders(c: Context, next: Next) {
  await next();

  // Only apply to HTML responses
  const contentType = c.res.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    return;
  }

  c.header('X-Frame-Options', 'DENY');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header(
    'Content-Security-Policy',
    "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' unpkg.com; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data:; " +
      "font-src 'self'; " +
      "connect-src 'self';",
  );

  // HSTS only in production (Cloudflare handles this via dashboard usually)
  if (c.env.ENVIRONMENT === 'production') {
    c.header(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload',
    );
  }
}
