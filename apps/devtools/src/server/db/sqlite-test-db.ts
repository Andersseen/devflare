/**
 * Test-only: DevTools' real migrations, applied to an in-memory SQLite, behind the
 * same `db.sql` tagged template db0 gives the routes.
 *
 * Node's built-in `node:sqlite` (Node ≥ 22.13) enforces foreign keys by
 * default, as D1 does, so cascade and constraint behaviour under test is the
 * behaviour production gets. It is reached through `process.getBuiltinModule`
 * because Vite's resolver does not know the `node:sqlite` specifier, and the
 * repo's @types/node predates its typings.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Statement {
  all(...values: unknown[]): Record<string, unknown>[];
  run(...values: unknown[]): unknown;
}

export interface RawDatabase {
  exec(sql: string): void;
  prepare(sql: string): Statement;
  close(): void;
}

const MIGRATIONS_DIR = join(__dirname, 'migrations');

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

export function openDatabase(): RawDatabase {
  const { DatabaseSync } = (
    process as unknown as { getBuiltinModule(id: string): unknown }
  ).getBuiltinModule('node:sqlite') as {
    DatabaseSync: new (path: string) => RawDatabase;
  };
  return new DatabaseSync(':memory:');
}

/**
 * Applies migrations whose file name sorts before `until` (all when omitted),
 * each as one transaction — the way `wrangler d1 migrations apply` does, so a
 * failing file leaves nothing of itself behind.
 */
export function applyMigrations(db: RawDatabase, until?: string): void {
  for (const file of migrationFiles()) {
    if (until && file >= until) break;
    applyMigration(db, file);
  }
}

export function applyMigration(db: RawDatabase, file: string): void {
  const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
  db.exec('BEGIN');
  try {
    db.exec(sql);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/** db0's shape: a SELECT answers `{ rows, success }`, a write `{ success }`. */
export function sqlOf(db: RawDatabase) {
  return {
    async sql(strings: TemplateStringsArray, ...values: unknown[]) {
      const query = strings.join('?');
      const statement = db.prepare(query);
      if (/^\s*(select|with)\b/i.test(query)) {
        return {
          rows: statement.all(...values).map((row) => ({ ...row })),
          success: true,
        };
      }
      statement.run(...values);
      return { success: true };
    },
  };
}
