import { createAuth } from '@org/auth';
import Database from 'better-sqlite3';

/**
 * Instancia de better-auth para devflare.
 * Usa SQLite local. La nueva app de Cloudflare creará su propio
 * archivo equivalente usando el adapter de D1.
 */
export const auth = createAuth({
  database: new Database('./data/devflare.db'),
  baseURL: process.env['BETTER_AUTH_URL'] ?? 'http://localhost:4200',
  secret: process.env['BETTER_AUTH_SECRET'],
});
