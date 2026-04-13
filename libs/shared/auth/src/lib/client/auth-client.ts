import { createAuthClient } from 'better-auth/client';

/**
 * Factory para el cliente de better-auth en el browser.
 * baseURL apunta al servidor Nitro de cada app.
 */
export function createClient(baseURL = '') {
  return createAuthClient({
    baseURL: `${baseURL}/api/auth`,
  });
}

export type AuthClient = ReturnType<typeof createClient>;
