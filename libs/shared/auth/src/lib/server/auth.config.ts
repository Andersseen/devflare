import { betterAuth } from 'better-auth';
import type { BetterAuthOptions } from 'better-auth';

export type AuthAdapterOptions = {
  database: BetterAuthOptions['database'];
  baseURL?: string;
  secret?: string;
};

/**
 * Factory que crea la instancia de better-auth.
 * Cada app del monorepo llama a esta función pasando su propio adapter de DB
 * (SQLite para devflare, D1 para la app de Cloudflare, etc.)
 */
export function createAuth(options: AuthAdapterOptions) {
  return betterAuth({
    database: options.database,
    baseURL: options.baseURL ?? 'http://localhost:4200',
    secret:
      options.secret ??
      process.env['BETTER_AUTH_SECRET'] ??
      'change-me-in-production',
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
    },
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5, // 5 minutos de cache en cookie
      },
    },
  });
}

export type AuthInstance = ReturnType<typeof createAuth>;
