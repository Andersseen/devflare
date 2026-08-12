/**
 * A D1 binding backed by in-process SQLite, for testing code that talks to the
 * database directly rather than through better-auth's adapter.
 *
 * The admin routes use drizzle over D1 (see ../../db/index.ts), so testing them
 * needs something that answers the `D1Database` interface. Node's built-in
 * `node:sqlite` speaks the same dialect D1 does, so this maps one onto the other
 * rather than mocking the queries — the SQL under test is the SQL that runs, and
 * against the real migrations. Built in rather than a dependency, deliberately:
 * a test helper is a poor reason to add a native module to the install.
 *
 * Only the surface drizzle's d1 driver actually calls is implemented. Anything
 * else throws rather than quietly returning a shape the caller will misread.
 */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(import.meta.dirname, '../../db/migrations');

type Row = Record<string, unknown>;

function isSelect(sql: string): boolean {
  return /^\s*(select|pragma|with)\b/i.test(sql);
}

/** True for statements that return rows even though they are writes. */
function hasReturning(sql: string): boolean {
  return /\breturning\b/i.test(sql);
}

/**
 * node:sqlite rejects values it has no binding for (booleans, Date, undefined).
 * D1 coerces them, so the shim has to as well or the code under test fails on
 * something the real binding accepts.
 */
function toSqlite(value: unknown): unknown {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.getTime();
  if (value === undefined) return null;
  return value;
}

function createStatement(db: DatabaseSync, sql: string, bound: unknown[]) {
  const params = () => bound.map(toSqlite) as never[];

  return {
    bind(...next: unknown[]) {
      return createStatement(db, sql, next);
    },

    async all() {
      if (isSelect(sql) || hasReturning(sql)) {
        const results = db.prepare(sql).all(...params()) as Row[];
        return { results, success: true, meta: { changes: 0 } };
      }
      const info = db.prepare(sql).run(...params());
      return {
        results: [] as Row[],
        success: true,
        meta: {
          changes: Number(info.changes),
          last_row_id: Number(info.lastInsertRowid),
        },
      };
    },

    async first(column?: string) {
      const row = db.prepare(sql).get(...params()) as Row | undefined;
      if (!row) return null;
      return column === undefined ? row : (row[column] ?? null);
    },

    async run() {
      const info = db.prepare(sql).run(...params());
      return {
        results: [] as Row[],
        success: true,
        meta: {
          changes: Number(info.changes),
          last_row_id: Number(info.lastInsertRowid),
        },
      };
    },

    /** Positional rows. node:sqlite has no raw mode, so derive it from the objects. */
    async raw() {
      const rows = db.prepare(sql).all(...params()) as Row[];
      return rows.map((row) => Object.values(row));
    },
  };
}

export interface TestD1 {
  binding: D1Database;
  sqlite: DatabaseSync;
  close(): void;
}

/**
 * A fresh database with every migration applied, so tests run against the real
 * schema instead of a hand-written approximation that can drift from it.
 */
export function createTestD1(migrations: string[]): TestD1 {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = OFF');

  for (const file of migrations) {
    sqlite.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
  }

  const binding = {
    prepare(sql: string) {
      return createStatement(sqlite, sql, []);
    },
    async batch(statements: { all(): Promise<unknown> }[]) {
      const results = [];
      for (const statement of statements) results.push(await statement.all());
      return results;
    },
    async exec(sql: string) {
      sqlite.exec(sql);
      return { count: 0, duration: 0 };
    },
    dump() {
      throw new Error('dump() is not implemented in the test D1 shim');
    },
    withSession() {
      throw new Error('withSession() is not implemented in the test D1 shim');
    },
  } as unknown as D1Database;

  return { binding, sqlite, close: () => sqlite.close() };
}
