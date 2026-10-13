import type { Rows, SqlDatabase } from '../../db';
import type { ReleaseRecord } from './types';

export const RELEASES_KEPT_PER_REPOSITORY = 10;

export interface ReleaseRow {
  id: number;
  repository_id: number;
  tag_name: string;
  name: string | null;
  prerelease: number;
  html_url: string;
  author_login: string | null;
  published_at: string;
  repository_full_name?: string;
}

export async function upsertRelease(
  db: SqlDatabase,
  r: ReleaseRecord,
): Promise<void> {
  await db.sql`INSERT INTO releases
      (id, repository_id, tag_name, name, prerelease, html_url, author_login, published_at)
    VALUES (${r.id}, ${r.repositoryId}, ${r.tagName}, ${r.name}, ${r.prerelease ? 1 : 0},
      ${r.htmlUrl}, ${r.authorLogin}, ${r.publishedAt})
    ON CONFLICT(id) DO UPDATE SET tag_name = excluded.tag_name, name = excluded.name,
      prerelease = excluded.prerelease, html_url = excluded.html_url,
      published_at = excluded.published_at`;
}

export async function deleteRelease(
  db: SqlDatabase,
  id: number,
): Promise<void> {
  await db.sql`DELETE FROM releases WHERE id = ${id}`;
}

export async function pruneReleases(
  db: SqlDatabase,
  repositoryId: number,
): Promise<void> {
  await db.sql`DELETE FROM releases WHERE repository_id = ${repositoryId} AND id NOT IN (
    SELECT id FROM releases WHERE repository_id = ${repositoryId}
    ORDER BY published_at DESC, id DESC LIMIT ${RELEASES_KEPT_PER_REPOSITORY})`;
}

export async function listReleasesFor(
  db: SqlDatabase,
  repositoryId: number,
): Promise<ReleaseRow[]> {
  const result = await db.sql<
    Rows<ReleaseRow>
  >`SELECT * FROM releases WHERE repository_id = ${repositoryId}
    ORDER BY published_at DESC, id DESC`;
  return result.rows ?? [];
}

/** Newest releases, only of the repositories `userId` follows. */
export async function listRecentReleases(
  db: SqlDatabase,
  limit: number,
  userId: string,
): Promise<ReleaseRow[]> {
  const result = await db.sql<
    Rows<ReleaseRow>
  >`SELECT r.*, repo.full_name AS repository_full_name
    FROM releases r JOIN repositories repo ON repo.id = r.repository_id
    WHERE r.repository_id IN (SELECT repository_id FROM followed_repository WHERE user_id = ${userId})
    ORDER BY r.published_at DESC, r.id DESC LIMIT ${limit}`;
  return result.rows ?? [];
}

/** Full reconciliation from the latest-releases listing. */
export async function replaceReleases(
  db: SqlDatabase,
  repositoryId: number,
  records: readonly ReleaseRecord[],
): Promise<void> {
  for (const record of records) await upsertRelease(db, record);
  const keep = JSON.stringify(records.map((r) => r.id));
  await db.sql`DELETE FROM releases WHERE repository_id = ${repositoryId}
    AND id NOT IN (SELECT value FROM json_each(${keep}))`;
}
