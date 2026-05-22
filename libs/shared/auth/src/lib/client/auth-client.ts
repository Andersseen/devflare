import { createAuthClient } from 'better-auth/client';

function getBaseURL(): string {
  if (typeof window !== 'undefined') {
    // Browser: necesita URL absoluta para que better-auth construya URLs válidas
    return window.location.origin;
  }
  // SSR/Node: necesita URL absoluta para prerender
  return process.env['BETTER_AUTH_URL'] ?? 'http://localhost:4200';
}

/**
 * Factory para el cliente de better-auth.
 * baseURL apunta al servidor Nitro de cada app.
 * En SSR se resuelve a una URL absoluta para evitar errores de prerender.
 */
export function createClient() {
  return createAuthClient({
    baseURL: `${getBaseURL()}/api/auth`,
  });
}

export type AuthClient = ReturnType<typeof createClient>;
