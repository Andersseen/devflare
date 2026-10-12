import type { Rows, SqlDatabase } from '../../db';
import type {
  CiRecord,
  HeadCommitRecord,
  RepositoryRecord,
  VersionRecord,
} from './types';

export interface RepositoryRow {
  id: number;
  installation_id: number;
  owner_login: string;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  private: number;
  archived: number;
  default_branch: string;
  pushed_at: string | null;
  head_sha: string | null;
  head_message: string | null;
  head_author: string | null;
  head_committed_at: string | null;
  ci_state: string;
  ci_sha: string | null;
  ci_updated_at: string | null;
  open_pr_count: number;
  version: string | null;
  version_source: string | null;
  version_at: string | null;
  last_synced_at: string | null;
}

const bool = (value: boolean): number => (value ? 1 : 0);

/**
 * Identity and metadata only — never head/CI/version, which have their own
 * writers. Follows renames and transfers: the key is the GitHub id.
 */
export async function upsertRepository(
  db: SqlDatabase,
  record: RepositoryRecord,
  now: string,
): Promise<void> {
  await db.sql`INSERT INTO repositories
      (id, installation_id, owner_login, name, full_name, html_url, description,
       private, archived, default_branch, pushed_at, created_at, updated_at)
    VALUES (${record.id}, ${record.installationId}, ${record.ownerLogin}, ${record.name},
      ${record.fullName}, ${record.htmlUrl}, ${record.description}, ${bool(record.private)},
      ${bool(record.archived)}, ${record.defaultBranch}, ${record.pushedAt}, ${now}, ${now})
    ON CONFLICT(id) DO UPDATE SET installation_id = excluded.installation_id,
      owner_login = excluded.owner_login, name = excluded.name, full_name = excluded.full_name,
      html_url = excluded.html_url, description = excluded.description,
      private = excluded.private, archived = excluded.archived,
      default_branch = excluded.default_branch, updated_at = excluded.updated_at,
      pushed_at = COALESCE(excluded.pushed_at, repositories.pushed_at)`;
}

export async function getRepository(
  db: SqlDatabase,
  id: number,
): Promise<RepositoryRow | null> {
  const result = await db.sql<
    Rows<RepositoryRow>
  >`SELECT * FROM repositories WHERE id = ${id}`;
  return result.rows?.[0] ?? null;
}

export async function listRepositoryIds(
  db: SqlDatabase,
  installationId: number,
): Promise<{ id: number; full_name: string }[]> {
  const result = await db.sql<
    Rows<{ id: number; full_name: string }>
  >`SELECT id, full_name FROM repositories WHERE installation_id = ${installationId}`;
  return result.rows ?? [];
}

export async function deleteRepository(
  db: SqlDatabase,
  id: number,
): Promise<void> {
  await db.sql`DELETE FROM repositories WHERE id = ${id}`;
}

/**
 * Moves the head forward, never back: webhooks can be delivered out of order,
 * and a stale push must not replace a newer commit.
 */
export async function applyHead(
  db: SqlDatabase,
  id: number,
  head: HeadCommitRecord,
  pushedAt: string | null,
): Promise<boolean> {
  const current = await getRepository(db, id);
  if (!current) return false;
  if (
    current.head_committed_at &&
    head.committedAt &&
    head.committedAt < current.head_committed_at
  ) {
    return false;
  }
  await db.sql`UPDATE repositories SET head_sha = ${head.sha}, head_message = ${head.message},
      head_author = ${head.author}, head_committed_at = ${head.committedAt},
      pushed_at = COALESCE(${pushedAt}, pushed_at)
    WHERE id = ${id}`;
  return true;
}

export async function applyCi(
  db: SqlDatabase,
  id: number,
  ci: CiRecord,
  now: string,
): Promise<void> {
  await db.sql`UPDATE repositories SET ci_state = ${ci.state}, ci_sha = ${ci.sha}, ci_updated_at = ${now} WHERE id = ${id}`;
}

export async function applyVersion(
  db: SqlDatabase,
  id: number,
  version: VersionRecord | null,
): Promise<void> {
  await db.sql`UPDATE repositories SET version = ${version?.value ?? null},
      version_source = ${version?.source ?? null}, version_at = ${version?.at ?? null}
    WHERE id = ${id}`;
}

export async function recountOpenPullRequests(
  db: SqlDatabase,
  id: number,
): Promise<void> {
  await db.sql`UPDATE repositories SET open_pr_count =
    (SELECT COUNT(*) FROM pull_requests WHERE repository_id = ${id}) WHERE id = ${id}`;
}

export async function markRepositorySynced(
  db: SqlDatabase,
  id: number,
  now: string,
): Promise<void> {
  await db.sql`UPDATE repositories SET last_synced_at = ${now} WHERE id = ${id}`;
}

/** Never-synced first, then the longest-unsynced, so budgeted runs rotate. */
export async function listSyncOrder(
  db: SqlDatabase,
  installationId: number,
): Promise<RepositoryRow[]> {
  const result = await db.sql<
    Rows<RepositoryRow>
  >`SELECT * FROM repositories WHERE installation_id = ${installationId}
    ORDER BY last_synced_at IS NOT NULL, last_synced_at ASC, id ASC`;
  return result.rows ?? [];
}

/**
 * Webhook payloads carry the repository's current names. Applying them keeps
 * a renamed or transferred repository correct between full syncs. Touches
 * identity only, and only for a repository DevRadar already knows.
 */
export async function updateIdentity(
  db: SqlDatabase,
  id: number,
  identity: {
    ownerLogin: string;
    name: string;
    fullName: string;
    htmlUrl: string;
    defaultBranch: string;
    private: boolean;
    archived: boolean;
  },
  now: string,
): Promise<void> {
  await db.sql`UPDATE repositories SET owner_login = ${identity.ownerLogin}, name = ${identity.name},
      full_name = ${identity.fullName}, html_url = ${identity.htmlUrl},
      default_branch = ${identity.defaultBranch}, private = ${bool(identity.private)},
      archived = ${bool(identity.archived)}, updated_at = ${now}
    WHERE id = ${id}`;
}
