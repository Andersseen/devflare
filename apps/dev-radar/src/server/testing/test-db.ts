import {
  applyMigrations,
  openDatabase,
  sqlOf,
  type RawDatabase,
} from '../db/sqlite-test-db';
import type { SqlDatabase } from '../db';

/** DevRadar's real migrations on a fresh in-memory SQLite, behind `db.sql`. */
export function createTestDb(): { raw: RawDatabase; db: SqlDatabase } {
  const raw = openDatabase();
  applyMigrations(raw);
  return { raw, db: sqlOf(raw) as unknown as SqlDatabase };
}

export const NOW = new Date('2026-10-12T12:00:00Z');
