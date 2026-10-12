import type { Rows, SqlDatabase } from '../../db';
import type { InstallationRecord } from './types';

export interface InstallationRow {
  id: number;
  account_id: number;
  account_login: string;
  account_type: string;
  repository_selection: string;
  suspended_at: string | null;
  last_synced_at: string | null;
  sync_error: string | null;
}

/** A sync run that dies keeps the lease for at most this long. */
export const SYNC_LEASE_MS = 5 * 60 * 1000;

export async function upsertInstallation(
  db: SqlDatabase,
  record: InstallationRecord,
  now: string,
): Promise<void> {
  await db.sql`INSERT INTO github_installations
      (id, account_id, account_login, account_type, repository_selection, suspended_at, created_at, updated_at)
    VALUES (${record.id}, ${record.accountId}, ${record.accountLogin}, ${record.accountType},
      ${record.repositorySelection}, ${record.suspendedAt}, ${now}, ${now})
    ON CONFLICT(id) DO UPDATE SET account_id = excluded.account_id,
      account_login = excluded.account_login, account_type = excluded.account_type,
      repository_selection = excluded.repository_selection,
      suspended_at = excluded.suspended_at, updated_at = excluded.updated_at`;
}

/** Cascades to the installation's repositories, PRs, runs and releases. */
export async function deleteInstallation(
  db: SqlDatabase,
  id: number,
): Promise<void> {
  await db.sql`DELETE FROM github_installations WHERE id = ${id}`;
}

export async function setInstallationSuspended(
  db: SqlDatabase,
  id: number,
  suspendedAt: string | null,
  now: string,
): Promise<void> {
  await db.sql`UPDATE github_installations SET suspended_at = ${suspendedAt}, updated_at = ${now} WHERE id = ${id}`;
}

export async function listInstallations(
  db: SqlDatabase,
): Promise<InstallationRow[]> {
  const result = await db.sql<
    Rows<InstallationRow>
  >`SELECT id, account_id, account_login, account_type,
      repository_selection, suspended_at, last_synced_at, sync_error
    FROM github_installations ORDER BY account_login COLLATE NOCASE`;
  return result.rows ?? [];
}

export async function hasInstallation(
  db: SqlDatabase,
  id: number,
): Promise<boolean> {
  const result = await db.sql<
    Rows<{ id: number }>
  >`SELECT id FROM github_installations WHERE id = ${id}`;
  return (result.rows?.length ?? 0) > 0;
}

/**
 * Takes the installation's sync lease if nobody holds a live one. A random
 * token is written with it and read back to confirm this caller — not a
 * concurrent one — won.
 */
export async function acquireSyncLease(
  db: SqlDatabase,
  id: number,
  now: Date,
): Promise<boolean> {
  const until = new Date(now.getTime() + SYNC_LEASE_MS).toISOString();
  const nowIso = now.toISOString();
  const token = crypto.randomUUID();
  await db.sql`UPDATE github_installations SET sync_lease_until = ${until}, sync_lease_token = ${token}
    WHERE id = ${id} AND (sync_lease_until IS NULL OR sync_lease_until <= ${nowIso})`;
  const result = await db.sql<
    Rows<{ sync_lease_token: string | null }>
  >`SELECT sync_lease_token FROM github_installations WHERE id = ${id}`;
  return result.rows?.[0]?.sync_lease_token === token;
}

export async function finishSync(
  db: SqlDatabase,
  id: number,
  outcome: { at: string; error: string | null },
): Promise<void> {
  await db.sql`UPDATE github_installations SET sync_lease_until = NULL, sync_lease_token = NULL,
      last_synced_at = ${outcome.at}, sync_error = ${outcome.error}, updated_at = ${outcome.at}
    WHERE id = ${id}`;
}

/** Installations that vanished from GitHub's list (missed `deleted` webhook). */
export async function deleteInstallationsNotIn(
  db: SqlDatabase,
  keepIds: number[],
): Promise<number[]> {
  const keep = JSON.stringify(keepIds);
  const stale = await db.sql<
    Rows<{ id: number }>
  >`SELECT id FROM github_installations
    WHERE id NOT IN (SELECT value FROM json_each(${keep}))`;
  const ids = (stale.rows ?? []).map((row) => row.id);
  for (const id of ids) await deleteInstallation(db, id);
  return ids;
}
