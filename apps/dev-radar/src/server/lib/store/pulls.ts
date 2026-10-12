import type { Rows, SqlDatabase } from '../../db';
import type { PullRequestRecord } from './types';

export interface PullRequestRow {
  id: number;
  repository_id: number;
  number: number;
  title: string;
  author_login: string | null;
  draft: number;
  html_url: string;
  base_ref: string;
  head_ref: string;
  head_sha: string;
  labels: string;
  created_at: string;
  updated_at: string;
}

/** Guarded by GitHub's `updated_at`: an older delivery changes nothing. */
export async function upsertPullRequest(
  db: SqlDatabase,
  r: PullRequestRecord,
): Promise<void> {
  await db.sql`INSERT INTO pull_requests
      (id, repository_id, number, title, author_login, draft, html_url, base_ref,
       head_ref, head_sha, labels, created_at, updated_at)
    VALUES (${r.id}, ${r.repositoryId}, ${r.number}, ${r.title}, ${r.authorLogin},
      ${r.draft ? 1 : 0}, ${r.htmlUrl}, ${r.baseRef}, ${r.headRef}, ${r.headSha},
      ${JSON.stringify(r.labels)}, ${r.createdAt}, ${r.updatedAt})
    ON CONFLICT(id) DO UPDATE SET repository_id = excluded.repository_id,
      number = excluded.number, title = excluded.title, author_login = excluded.author_login,
      draft = excluded.draft, html_url = excluded.html_url, base_ref = excluded.base_ref,
      head_ref = excluded.head_ref, head_sha = excluded.head_sha, labels = excluded.labels,
      updated_at = excluded.updated_at
    WHERE excluded.updated_at >= pull_requests.updated_at`;
}

export async function deletePullRequest(
  db: SqlDatabase,
  id: number,
): Promise<void> {
  await db.sql`DELETE FROM pull_requests WHERE id = ${id}`;
}

/** Full reconciliation from a complete open-PR listing. */
export async function replaceOpenPullRequests(
  db: SqlDatabase,
  repositoryId: number,
  records: readonly PullRequestRecord[],
): Promise<void> {
  for (const record of records) await upsertPullRequest(db, record);
  const keep = JSON.stringify(records.map((r) => r.id));
  await db.sql`DELETE FROM pull_requests WHERE repository_id = ${repositoryId}
    AND id NOT IN (SELECT value FROM json_each(${keep}))`;
}

export async function listPullRequestRows(
  db: SqlDatabase,
  repositoryId?: number,
): Promise<PullRequestRow[]> {
  const result =
    repositoryId === undefined
      ? await db.sql<
          Rows<PullRequestRow>
        >`SELECT * FROM pull_requests ORDER BY updated_at DESC LIMIT 500`
      : await db.sql<
          Rows<PullRequestRow>
        >`SELECT * FROM pull_requests WHERE repository_id = ${repositoryId} ORDER BY updated_at DESC`;
  return result.rows ?? [];
}
