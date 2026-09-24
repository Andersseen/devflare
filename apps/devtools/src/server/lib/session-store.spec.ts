import {
  applyMigrations,
  openDatabase,
  sqlOf,
  type RawDatabase,
} from '../db/sqlite-test-db';
import type { SqlDatabase } from '../db';
import {
  SESSION_TTL_MS,
  createSession,
  deleteSession,
  findSession,
  hashToken,
} from './session-store';

const USER = { id: 'sub-1', email: 'a@example.com', name: 'Ada', image: null };

describe('DevTools session store', () => {
  let raw: RawDatabase;
  let db: SqlDatabase;

  beforeEach(() => {
    raw = openDatabase();
    applyMigrations(raw);
    db = sqlOf(raw) as unknown as SqlDatabase;
  });
  afterEach(() => raw.close());

  it('creates a session that resolves to the user', async () => {
    const { token } = await createSession(db, USER);
    await expect(findSession(db, token)).resolves.toEqual(USER);
  });

  it('stores only a hash of the token', async () => {
    const { token } = await createSession(db, USER);
    const rows = raw.prepare('SELECT token_hash FROM app_session').all();
    expect(rows).toEqual([{ token_hash: await hashToken(token) }]);
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  it('issues a fresh 256-bit token every time', async () => {
    const a = await createSession(db, USER);
    const b = await createSession(db, USER);
    expect(a.token).not.toBe(b.token);
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('expires sessions and removes the row', async () => {
    const start = new Date('2026-01-01T00:00:00Z');
    const { token } = await createSession(db, USER, start);
    const later = new Date(start.getTime() + SESSION_TTL_MS + 1);
    await expect(findSession(db, token, later)).resolves.toBeNull();
    expect(raw.prepare('SELECT * FROM app_session').all()).toEqual([]);
  });

  it('refreshes the profile copy on each sign-in', async () => {
    await createSession(db, USER);
    const { token } = await createSession(db, {
      ...USER,
      name: 'Ada L.',
      email: 'new@example.com',
    });
    await expect(findSession(db, token)).resolves.toMatchObject({
      name: 'Ada L.',
      email: 'new@example.com',
    });
  });

  it('ends a session and ignores unknown tokens', async () => {
    const { token } = await createSession(db, USER);
    await deleteSession(db, token);
    await expect(findSession(db, token)).resolves.toBeNull();
    await expect(findSession(db, 'nope')).resolves.toBeNull();
  });
});
