import { describe, expect, it } from 'vitest';
import {
  applyMigration,
  applyMigrations,
  migrationFiles,
  openDatabase,
  type RawDatabase,
} from './sqlite-test-db';

/**
 * 0005 moves every project's single `cfType`/`cfName` link into
 * `project_resource` and drops the two columns. Production already holds rows
 * written under 0002, so this runs the real SQL files over representative
 * legacy data rather than trusting the migration by eye.
 */

const MIGRATION = '0005_project_resource.sql';

function legacyDatabase(): RawDatabase {
  const db = openDatabase();
  applyMigrations(db, MIGRATION);
  return db;
}

function insertLegacy(
  db: RawDatabase,
  row: {
    id: string;
    name: string;
    cfType: string | null;
    cfName: string | null;
    createdAt?: string;
    userId?: string;
  },
) {
  db.prepare(
    'INSERT INTO projects (id, userId, name, repoUrl, createdAt, cfType, cfName) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(
    row.id,
    row.userId ?? 'user-1',
    row.name,
    null,
    row.createdAt ?? '2026-08-01T00:00:00.000Z',
    row.cfType,
    row.cfName,
  );
}

function resources(db: RawDatabase) {
  return db
    .prepare(
      'SELECT projectId, provider, type, resourceId, resourceName, createdAt FROM project_resource ORDER BY projectId, type',
    )
    .all()
    .map((row) => ({ ...row }));
}

function columns(db: RawDatabase, table: string): string[] {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((row) => String(row['name']));
}

describe('migration order', () => {
  it('has unique, contiguous numbers', () => {
    const numbers = migrationFiles().map((file) => Number(file.slice(0, 4)));
    expect(numbers).toEqual(numbers.map((_, index) => index));
    expect(migrationFiles()).toContain(MIGRATION);
  });
});

describe(MIGRATION, () => {
  it('turns each legacy link into one project_resource row', () => {
    const db = legacyDatabase();
    insertLegacy(db, {
      id: 'ally',
      name: 'Ally',
      cfType: 'pages',
      cfName: 'ally',
      createdAt: '2026-08-02T10:00:00.000Z',
    });
    insertLegacy(db, {
      id: 'devflare',
      name: 'DevFlare',
      cfType: 'worker',
      cfName: '  devflare  ',
    });

    applyMigration(db, MIGRATION);

    expect(resources(db)).toEqual([
      {
        projectId: 'ally',
        provider: 'cloudflare',
        type: 'pages',
        resourceId: 'ally',
        resourceName: 'ally',
        createdAt: '2026-08-02T10:00:00.000Z',
      },
      {
        projectId: 'devflare',
        provider: 'cloudflare',
        type: 'worker',
        resourceId: 'devflare',
        resourceName: 'devflare',
        createdAt: '2026-08-01T00:00:00.000Z',
      },
    ]);
  });

  it('keeps unlinked and half-linked projects, with no resource invented', () => {
    const db = legacyDatabase();
    insertLegacy(db, { id: 'a', name: 'Plain', cfType: null, cfName: null });
    insertLegacy(db, { id: 'b', name: 'Half', cfType: 'pages', cfName: null });
    insertLegacy(db, { id: 'c', name: 'Blank', cfType: 'worker', cfName: ' ' });

    applyMigration(db, MIGRATION);

    expect(resources(db)).toEqual([]);
    expect(
      db.prepare('SELECT id, name FROM projects ORDER BY id').all().length,
    ).toBe(3);
  });

  it('drops the legacy columns and keeps every project column that remains', () => {
    const db = legacyDatabase();
    applyMigration(db, MIGRATION);

    expect(columns(db, 'projects')).toEqual([
      'id',
      'userId',
      'name',
      'repoUrl',
      'createdAt',
    ]);
  });

  it('fails as a whole, changing nothing, when two projects claim one resource', () => {
    const db = legacyDatabase();
    insertLegacy(db, { id: 'a', name: 'One', cfType: 'worker', cfName: 'api' });
    insertLegacy(db, { id: 'b', name: 'Two', cfType: 'worker', cfName: 'api' });

    expect(() => applyMigration(db, MIGRATION)).toThrow(/UNIQUE/);

    // Rolled back: the legacy columns and their data are still there to fix.
    expect(columns(db, 'projects')).toContain('cfType');
    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE name = 'project_resource'",
        )
        .all(),
    ).toEqual([]);
  });
});

describe('project_resource constraints', () => {
  function migrated(): RawDatabase {
    const db = openDatabase();
    applyMigrations(db);
    db.prepare(
      'INSERT INTO projects (id, userId, name, repoUrl, createdAt) VALUES (?, ?, ?, ?, ?)',
    ).run('p1', 'user-1', 'Ally', null, '2026-09-01T00:00:00.000Z');
    db.prepare(
      'INSERT INTO projects (id, userId, name, repoUrl, createdAt) VALUES (?, ?, ?, ?, ?)',
    ).run('p2', 'user-1', 'Imageryx', null, '2026-09-01T00:00:00.000Z');
    return db;
  }

  function link(
    db: RawDatabase,
    id: string,
    projectId: string,
    type: string,
    resourceId: string,
  ) {
    db.prepare(
      'INSERT INTO project_resource (id, projectId, provider, type, resourceId, resourceName, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(id, projectId, 'cloudflare', type, resourceId, resourceId, 'now');
  }

  it('holds many resources of every type for one project', () => {
    const db = migrated();
    link(db, 'r1', 'p1', 'worker', 'ally-api');
    link(db, 'r2', 'p1', 'worker', 'ally-runner');
    link(db, 'r3', 'p1', 'pages', 'ally-web');
    link(db, 'r4', 'p1', 'd1', 'uuid-1');
    link(db, 'r5', 'p1', 'r2', 'ally-reports');
    link(db, 'r6', 'p1', 'kv', 'ns-1');

    expect(resources(db)).toHaveLength(6);
  });

  it('refuses a second link to the same resource, in any project', () => {
    const db = migrated();
    link(db, 'r1', 'p1', 'worker', 'ally-api');

    expect(() => link(db, 'r2', 'p1', 'worker', 'ally-api')).toThrow(/UNIQUE/);
    expect(() => link(db, 'r3', 'p2', 'worker', 'ally-api')).toThrow(/UNIQUE/);
    // Same identifier, different product: a different resource.
    expect(() => link(db, 'r4', 'p2', 'pages', 'ally-api')).not.toThrow();
  });

  it('refuses an unknown type, provider or project', () => {
    const db = migrated();
    expect(() => link(db, 'r1', 'p1', 'queue', 'jobs')).toThrow(/CHECK/);
    expect(() => link(db, 'r2', 'missing', 'worker', 'x')).toThrow(/FOREIGN/);
    expect(() =>
      db
        .prepare(
          'INSERT INTO project_resource (id, projectId, provider, type, resourceId, resourceName, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .run('r3', 'p1', 'aws', 'worker', 'x', 'x', 'now'),
    ).toThrow(/CHECK/);
  });

  it('removes the links, and only them, when their project is deleted', () => {
    const db = migrated();
    link(db, 'r1', 'p1', 'worker', 'ally-api');
    link(db, 'r2', 'p2', 'worker', 'imageryx-api');

    db.prepare('DELETE FROM projects WHERE id = ?').run('p1');

    expect(resources(db).map((row) => row['projectId'])).toEqual(['p2']);
  });

  it('applies cleanly to an empty database', () => {
    // Guard against a migration that only works on a database with rows.
    expect(() => applyMigrations(openDatabase())).not.toThrow();
  });
});
