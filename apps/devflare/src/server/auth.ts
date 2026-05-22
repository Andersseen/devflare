import { betterAuth } from 'better-auth';
import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

function getDbPath(): string {
  const cwd = process.cwd();
  // En dev, Nitro corre desde apps/devflare/, subimos 2 niveles al root
  const rootPath = cwd.includes('apps/devflare') ? resolve(cwd, '../../data/devflare.db') : resolve(cwd, 'data/devflare.db');
  const dir = resolve(rootPath, '..');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return rootPath;
}

export const auth = betterAuth({
  database: new Database(getDbPath()),
  baseURL: process.env['BETTER_AUTH_URL'] ?? 'http://localhost:5173',
  secret: process.env['BETTER_AUTH_SECRET'] ?? 'change-me-in-production',
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
});
