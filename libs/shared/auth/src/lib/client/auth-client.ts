import { createAuthClient } from 'better-auth/client';

function getBaseURL(): string {
  if (typeof window !== 'undefined') {
    // Browser: check for configured external auth service
    const configured = (import.meta as any).env?.['VITE_DEV_AUTH_URL']
      || (window as any).__DEV_AUTH_URL__
      || '';

    if (configured) {
      return configured;
    }

    // Default: same origin (Vite dev proxy handles /api/auth in development)
    return window.location.origin;
  }

  // SSR/Node: use env var or fallback
  return process.env['DEV_AUTH_URL'] ?? process.env['BETTER_AUTH_URL'] ?? 'http://localhost:4200';
}

/**
 * Factory para el cliente de better-auth.
 * - In development (with Vite proxy): baseURL is same-origin, proxy forwards to dev-auth
 * - In production: baseURL points to the external auth service (DEV_AUTH_URL)
 */
export function createClient() {
  const baseURL = getBaseURL();
  const authBase = baseURL.endsWith('/api/auth') ? baseURL : `${baseURL}/api/auth`;

  return createAuthClient({
    baseURL: authBase,
  });
}

export type AuthClient = ReturnType<typeof createClient>;
