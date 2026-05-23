import { createAuthClient } from 'better-auth/client';

interface ImportMetaEnv {
  env?: {
    VITE_DEV_AUTH_URL?: string;
  };
}

interface WindowWithDevAuth extends Window {
  __DEV_AUTH_URL__?: string;
}

function getBaseURL(): string {
  if (typeof window !== 'undefined') {
    // Browser: check for configured external auth service
    const viteUrl = (import.meta as unknown as ImportMetaEnv).env
      ?.VITE_DEV_AUTH_URL;
    const windowUrl = (window as WindowWithDevAuth).__DEV_AUTH_URL__;
    const configured = viteUrl || windowUrl || '';

    if (configured) {
      return configured;
    }

    // Default: same origin (Nitro proxy handles /api/auth in development)
    return window.location.origin;
  }

  // SSR/Node: use env var or fallback
  return (
    process.env['DEV_AUTH_URL'] ??
    process.env['BETTER_AUTH_URL'] ??
    'http://localhost:4200'
  );
}

/**
 * Factory para el cliente de better-auth.
 * - In development (with Nitro proxy): baseURL is same-origin, proxy forwards to dev-auth
 * - In production: baseURL points to the external auth service (DEV_AUTH_URL)
 */
export function createClient() {
  const baseURL = getBaseURL();
  const authBase = baseURL.endsWith('/api/auth')
    ? baseURL
    : `${baseURL}/api/auth`;

  return createAuthClient({
    baseURL: authBase,
  });
}

export type AuthClient = ReturnType<typeof createClient>;
