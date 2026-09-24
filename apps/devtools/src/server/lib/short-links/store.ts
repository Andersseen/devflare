import type { SqlDatabase } from '../../db';
import {
  checkDestination,
  checkSlug,
  normalizeSlug,
  publicUrl,
  type ShortLinkBase,
} from './validation';

/**
 * Personal short links, scoped by owner. Every read and write for management
 * carries `owner_user_id`, so a link that belongs to someone else behaves
 * exactly like one that does not exist. The public redirect is the only
 * lookup by slug alone.
 */

export type ShortLinkErrorCode =
  | 'invalid_slug'
  | 'reserved_slug'
  | 'invalid_destination'
  | 'slug_taken'
  | 'not_found'
  | 'invalid_input';

const STATUS: Record<ShortLinkErrorCode, number> = {
  invalid_slug: 422,
  reserved_slug: 422,
  invalid_destination: 422,
  invalid_input: 400,
  slug_taken: 409,
  not_found: 404,
};

export class ShortLinkError extends Error {
  readonly status: number;
  constructor(
    readonly code: ShortLinkErrorCode,
    message: string,
  ) {
    super(message);
    this.status = STATUS[code];
  }
}

export interface ShortLink {
  id: string;
  slug: string;
  destination: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  shortUrl: string | null;
}

interface Row {
  id: string;
  owner_user_id: string;
  slug: string;
  destination: string;
  active: number;
  created_at: string;
  updated_at: string;
}

interface Rows<T> {
  rows?: T[];
}

function toLink(row: Row, base: ShortLinkBase | null): ShortLink {
  return {
    id: row.id,
    slug: row.slug,
    destination: row.destination,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    shortUrl: base ? publicUrl(base, row.slug) : null,
  };
}

function validSlug(raw: unknown): string {
  const slug = normalizeSlug(raw);
  const problem = checkSlug(slug);
  if (problem === 'invalid_slug') {
    throw new ShortLinkError(
      'invalid_slug',
      'Use 1–64 lowercase letters, digits or hyphens, not starting or ending with a hyphen.',
    );
  }
  if (problem === 'reserved_slug') {
    throw new ShortLinkError(
      'reserved_slug',
      `"${slug}" is reserved by DevTools.`,
    );
  }
  return slug;
}

function validDestination(raw: unknown, base: ShortLinkBase | null): string {
  const result = checkDestination(raw, base);
  if (!result.ok)
    throw new ShortLinkError('invalid_destination', result.reason);
  return result.url;
}

function isUniqueViolation(error: unknown): boolean {
  // Duck-typed: D1 and node:sqlite errors do not always share this realm's
  // Error prototype, and D1 sometimes nests the SQLite message in `cause`.
  const describe = (value: unknown): string =>
    value && typeof value === 'object' && 'message' in value
      ? String((value as { message: unknown }).message)
      : '';
  const cause =
    error && typeof error === 'object'
      ? (error as { cause?: unknown }).cause
      : undefined;
  return /UNIQUE constraint failed/i.test(
    `${describe(error)} ${describe(cause)}`,
  );
}

async function slugOwnedByAnother(
  db: SqlDatabase,
  slug: string,
  exceptId?: string,
): Promise<boolean> {
  const result = await db.sql<
    Rows<{ id: string }>
  >`SELECT id FROM short_link WHERE slug = ${slug}`;
  const row = result.rows?.[0];
  return !!row && row.id !== exceptId;
}

async function findOwned(
  db: SqlDatabase,
  ownerId: string,
  id: string,
): Promise<Row> {
  const result = await db.sql<
    Rows<Row>
  >`SELECT * FROM short_link WHERE id = ${id} AND owner_user_id = ${ownerId}`;
  const row = result.rows?.[0];
  if (!row) throw new ShortLinkError('not_found', 'No such short link.');
  return row;
}

export async function listLinks(
  db: SqlDatabase,
  ownerId: string,
  base: ShortLinkBase | null,
): Promise<ShortLink[]> {
  const result = await db.sql<Rows<Row>>`SELECT * FROM short_link
    WHERE owner_user_id = ${ownerId} ORDER BY created_at DESC, slug ASC`;
  return (result.rows ?? []).map((row) => toLink(row, base));
}

export async function createLink(
  db: SqlDatabase,
  ownerId: string,
  input: unknown,
  base: ShortLinkBase | null,
  now = new Date(),
): Promise<ShortLink> {
  if (!input || typeof input !== 'object') {
    throw new ShortLinkError(
      'invalid_input',
      'Expected { slug, destination }.',
    );
  }
  const body = input as Record<string, unknown>;
  const slug = validSlug(body['slug']);
  const destination = validDestination(body['destination'], base);

  if (await slugOwnedByAnother(db, slug)) {
    throw new ShortLinkError('slug_taken', `"${slug}" is already taken.`);
  }

  const id = crypto.randomUUID();
  const iso = now.toISOString();
  try {
    await db.sql`INSERT INTO short_link (id, owner_user_id, slug, destination, active, created_at, updated_at)
      VALUES (${id}, ${ownerId}, ${slug}, ${destination}, ${1}, ${iso}, ${iso})`;
  } catch (error) {
    // Two creates racing for one slug: the UNIQUE index decides.
    if (isUniqueViolation(error)) {
      throw new ShortLinkError('slug_taken', `"${slug}" is already taken.`);
    }
    throw error;
  }
  return toLink(await findOwned(db, ownerId, id), base);
}

export async function updateLink(
  db: SqlDatabase,
  ownerId: string,
  id: string,
  input: unknown,
  base: ShortLinkBase | null,
  now = new Date(),
): Promise<ShortLink> {
  if (!input || typeof input !== 'object') {
    throw new ShortLinkError(
      'invalid_input',
      'Expected { slug?, destination?, active? }.',
    );
  }
  const body = input as Record<string, unknown>;
  const current = await findOwned(db, ownerId, id);

  const slug =
    body['slug'] === undefined ? current.slug : validSlug(body['slug']);
  const destination =
    body['destination'] === undefined
      ? current.destination
      : validDestination(body['destination'], base);
  let active = current.active;
  if (body['active'] !== undefined) {
    if (typeof body['active'] !== 'boolean') {
      throw new ShortLinkError(
        'invalid_input',
        '"active" must be true or false.',
      );
    }
    active = body['active'] ? 1 : 0;
  }

  if (slug !== current.slug && (await slugOwnedByAnother(db, slug, id))) {
    throw new ShortLinkError('slug_taken', `"${slug}" is already taken.`);
  }

  try {
    await db.sql`UPDATE short_link SET slug = ${slug}, destination = ${destination}, active = ${active},
      updated_at = ${now.toISOString()} WHERE id = ${id} AND owner_user_id = ${ownerId}`;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ShortLinkError('slug_taken', `"${slug}" is already taken.`);
    }
    throw error;
  }
  return toLink(await findOwned(db, ownerId, id), base);
}

export async function deleteLink(
  db: SqlDatabase,
  ownerId: string,
  id: string,
): Promise<void> {
  await findOwned(db, ownerId, id);
  await db.sql`DELETE FROM short_link WHERE id = ${id} AND owner_user_id = ${ownerId}`;
}

/** The public redirect's single read. */
export async function findBySlug(
  db: SqlDatabase,
  slug: string,
): Promise<{ destination: string; active: boolean } | null> {
  const result = await db.sql<
    Rows<{ destination: string; active: number }>
  >`SELECT destination, active
    FROM short_link WHERE slug = ${slug}`;
  const row = result.rows?.[0];
  return row
    ? { destination: row.destination, active: row.active === 1 }
    : null;
}

export type RedirectDecision =
  | { status: 302; location: string }
  | { status: 404 | 410 };

/**
 * 302, not 301/308: destinations are editable, and a permanent redirect is
 * cached by browsers indefinitely — an edited link would keep sending
 * returning visitors to the old place. 410 for a disabled link says "this
 * existed and was switched off"; 404 for anything unknown.
 */
export async function resolveRedirect(
  db: SqlDatabase,
  slug: string,
): Promise<RedirectDecision> {
  const link = await findBySlug(db, slug);
  if (!link) return { status: 404 };
  if (!link.active) return { status: 410 };
  return { status: 302, location: link.destination };
}
