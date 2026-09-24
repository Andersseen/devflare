import {
  applyMigrations,
  openDatabase,
  sqlOf,
  type RawDatabase,
} from '../../db/sqlite-test-db';
import type { SqlDatabase } from '../../db';
import {
  ShortLinkError,
  createLink,
  deleteLink,
  listLinks,
  resolveRedirect,
  updateLink,
} from './store';
import {
  checkDestination,
  checkSlug,
  matchShortLinkRequest,
  parseShortLinkBase,
  type ShortLinkBase,
} from './validation';

function base(raw: string): ShortLinkBase {
  const parsed = parseShortLinkBase(raw);
  if (!parsed) throw new Error(`bad base ${raw}`);
  return parsed;
}

const BASE = base('https://go.example.dev');
const DEV_BASE = base('http://localhost:4300/api/go');
const OWNER = 'owner-sub';
const OTHER = 'other-sub';

async function expectCode(work: Promise<unknown>, code: string) {
  await expect(work).rejects.toBeInstanceOf(ShortLinkError);
  await expect(work).rejects.toMatchObject({ code });
}

describe('short-link validation', () => {
  it('accepts lowercase URL-safe slugs', () => {
    for (const slug of ['cv', 'github', 'a', 'x-1', 'a'.repeat(64)])
      expect(checkSlug(slug)).toBeNull();
  });

  it('rejects malformed slugs', () => {
    for (const slug of [
      '',
      '-a',
      'a-',
      'A',
      'a_b',
      'a.b',
      'a/b',
      'ü',
      'a'.repeat(65),
    ]) {
      expect(checkSlug(slug)).toBe('invalid_slug');
    }
  });

  it('reserves tool paths and system names', () => {
    for (const slug of [
      'api',
      'qr-generator',
      'short-links',
      'domain-inspector',
      'go',
      'health',
    ]) {
      expect(checkSlug(slug)).toBe('reserved_slug');
    }
  });

  it('allows only http(s) destinations without credentials', () => {
    expect(checkDestination('https://github.com/andersseen', BASE)).toEqual({
      ok: true,
      url: 'https://github.com/andersseen',
    });
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,<script>',
      'file:///etc/passwd',
      'ftp://x.example',
      '//evil.example',
      '/relative',
      'https://user:pass@x.example',
      `https://x.example/${'a'.repeat(2048)}`,
      '',
      42,
    ]) {
      expect(checkDestination(bad, BASE).ok).toBe(false);
    }
  });

  it('refuses a destination that loops back into short links', () => {
    expect(checkDestination('https://go.example.dev/cv', BASE).ok).toBe(false);
    expect(
      checkDestination('http://localhost:4300/api/go/cv', DEV_BASE).ok,
    ).toBe(false);
    expect(
      checkDestination('http://localhost:4300/qr-generator', DEV_BASE).ok,
    ).toBe(true);
  });
});

describe('short-link request matching', () => {
  const url = (value: string) => new URL(value);

  it('claims single-segment slugs on a dedicated host', () => {
    expect(
      matchShortLinkRequest(url('https://go.example.dev/CV/'), BASE),
    ).toEqual({ kind: 'slug', slug: 'cv' });
  });

  it('lets everything else through on that host', () => {
    for (const path of [
      '/',
      '/api/auth/login',
      '/qr-generator',
      '/favicon.svg',
      '/a/b',
    ]) {
      expect(
        matchShortLinkRequest(url(`https://go.example.dev${path}`), BASE),
      ).toBeNull();
    }
    expect(
      matchShortLinkRequest(url('https://devtools.example.dev/cv'), BASE),
    ).toBeNull();
  });

  it('answers 404 for junk under an explicit prefix', () => {
    expect(
      matchShortLinkRequest(url('http://localhost:4300/api/go/cv'), DEV_BASE),
    ).toEqual({ kind: 'slug', slug: 'cv' });
    expect(
      matchShortLinkRequest(url('http://localhost:4300/api/go/a/b'), DEV_BASE),
    ).toEqual({ kind: 'invalid' });
    expect(
      matchShortLinkRequest(url('http://localhost:4300/api/go/%E0'), DEV_BASE),
    ).toEqual({ kind: 'invalid' });
    expect(
      matchShortLinkRequest(
        url('http://localhost:4300/api/auth/login'),
        DEV_BASE,
      ),
    ).toBeNull();
  });

  it('ignores an unusable base', () => {
    expect(parseShortLinkBase(undefined)).toBeNull();
    expect(parseShortLinkBase('not a url')).toBeNull();
    expect(parseShortLinkBase('ftp://x')).toBeNull();
  });
});

describe('short-link store', () => {
  let raw: RawDatabase;
  let db: SqlDatabase;

  beforeEach(() => {
    raw = openDatabase();
    applyMigrations(raw);
    db = sqlOf(raw) as unknown as SqlDatabase;
  });
  afterEach(() => raw.close());

  it('creates, lists and resolves a link', async () => {
    const link = await createLink(
      db,
      OWNER,
      { slug: ' CV ', destination: 'https://example.com/cv.pdf' },
      BASE,
    );
    expect(link).toMatchObject({
      slug: 'cv',
      destination: 'https://example.com/cv.pdf',
      active: true,
      shortUrl: 'https://go.example.dev/cv',
    });
    expect((await listLinks(db, OWNER, BASE)).map((l) => l.slug)).toEqual([
      'cv',
    ]);
    await expect(resolveRedirect(db, 'cv')).resolves.toEqual({
      status: 302,
      location: 'https://example.com/cv.pdf',
    });
  });

  it('stores the owner from the caller, not from the body', async () => {
    await createLink(
      db,
      OWNER,
      { slug: 'x', destination: 'https://x.example', owner_user_id: OTHER },
      BASE,
    );
    expect(raw.prepare('SELECT owner_user_id FROM short_link').all()).toEqual([
      { owner_user_id: OWNER },
    ]);
  });

  it('rejects duplicate, reserved, invalid and unsafe input', async () => {
    await createLink(
      db,
      OWNER,
      { slug: 'cv', destination: 'https://x.example' },
      BASE,
    );
    await expectCode(
      createLink(
        db,
        OTHER,
        { slug: 'cv', destination: 'https://y.example' },
        BASE,
      ),
      'slug_taken',
    );
    await expectCode(
      createLink(
        db,
        OWNER,
        { slug: 'api', destination: 'https://y.example' },
        BASE,
      ),
      'reserved_slug',
    );
    await expectCode(
      createLink(
        db,
        OWNER,
        { slug: 'Bad Slug', destination: 'https://y.example' },
        BASE,
      ),
      'invalid_slug',
    );
    await expectCode(
      createLink(
        db,
        OWNER,
        { slug: 'ok', destination: 'javascript:alert(1)' },
        BASE,
      ),
      'invalid_destination',
    );
    await expectCode(createLink(db, OWNER, null, BASE), 'invalid_input');
  });

  it('maps a racing UNIQUE violation to slug_taken', async () => {
    await createLink(
      db,
      OWNER,
      { slug: 'race', destination: 'https://x.example' },
      BASE,
    );
    // Simulate losing the race: the pre-check sees nothing, the insert hits the index.
    const racing: SqlDatabase = {
      sql: (async (strings: TemplateStringsArray, ...values: unknown[]) =>
        /^SELECT id FROM short_link WHERE slug/.test(strings.join('?').trim())
          ? { rows: [] }
          : db.sql(strings, ...values)) as SqlDatabase['sql'],
    };
    await expectCode(
      createLink(
        racing,
        OTHER,
        { slug: 'race', destination: 'https://y.example' },
        BASE,
      ),
      'slug_taken',
    );
  });

  it('updates slug and destination, and disables', async () => {
    const link = await createLink(
      db,
      OWNER,
      { slug: 'gh', destination: 'https://github.com' },
      BASE,
    );
    const updated = await updateLink(
      db,
      OWNER,
      link.id,
      { slug: 'github', destination: 'https://github.com/andersseen' },
      BASE,
      new Date('2030-01-01T00:00:00Z'),
    );
    expect(updated).toMatchObject({
      slug: 'github',
      destination: 'https://github.com/andersseen',
      updatedAt: '2030-01-01T00:00:00.000Z',
    });

    await updateLink(db, OWNER, link.id, { active: false }, BASE);
    await expect(resolveRedirect(db, 'github')).resolves.toEqual({
      status: 410,
    });
    await expect(resolveRedirect(db, 'gh')).resolves.toEqual({ status: 404 });

    await expectCode(
      updateLink(db, OWNER, link.id, { active: 'no' }, BASE),
      'invalid_input',
    );
  });

  it('refuses to rename onto a taken slug', async () => {
    await createLink(
      db,
      OWNER,
      { slug: 'a', destination: 'https://a.example' },
      BASE,
    );
    const b = await createLink(
      db,
      OWNER,
      { slug: 'b', destination: 'https://b.example' },
      BASE,
    );
    await expectCode(
      updateLink(db, OWNER, b.id, { slug: 'a' }, BASE),
      'slug_taken',
    );
    // Keeping its own slug is not a conflict.
    await expect(
      updateLink(db, OWNER, b.id, { slug: 'b' }, BASE),
    ).resolves.toMatchObject({ slug: 'b' });
  });

  it('treats another owner’s link as not found', async () => {
    const link = await createLink(
      db,
      OWNER,
      { slug: 'mine', destination: 'https://x.example' },
      BASE,
    );
    await expectCode(
      updateLink(
        db,
        OTHER,
        link.id,
        { destination: 'https://evil.example' },
        BASE,
      ),
      'not_found',
    );
    await expectCode(deleteLink(db, OTHER, link.id), 'not_found');
    expect(await listLinks(db, OTHER, BASE)).toEqual([]);
    await expect(resolveRedirect(db, 'mine')).resolves.toMatchObject({
      location: 'https://x.example/',
    });
  });

  it('deletes a link', async () => {
    const link = await createLink(
      db,
      OWNER,
      { slug: 'tmp', destination: 'https://x.example' },
      BASE,
    );
    await deleteLink(db, OWNER, link.id);
    await expect(resolveRedirect(db, 'tmp')).resolves.toEqual({ status: 404 });
    await expectCode(deleteLink(db, OWNER, link.id), 'not_found');
  });

  it('works without a configured base URL', async () => {
    const link = await createLink(
      db,
      OWNER,
      { slug: 'nobase', destination: 'https://x.example' },
      null,
    );
    expect(link.shortUrl).toBeNull();
  });
});
