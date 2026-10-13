import {
  computeCiState,
  ciNeedsAttention,
  type CiState,
} from '../../../shared/ci-state';
import type { DomainEventType } from '../../../shared/domain-events';
import type {
  ActivityDto,
  ConnectionDto,
  InstallationDto,
  OverviewDto,
  PullRequestDto,
  ReleaseDto,
  RepositoryDetailDto,
  RepositoryDto,
  SettingsDto,
  WorkflowRunDto,
} from '../../../shared/dto';
import { releaseHint } from '../../../shared/release-hint';
import type { Rows, SqlDatabase } from '../../db';
import { countFollowed } from './dashboard';
import { listEvents, type EventRow } from './events';
import { listInstallations } from './installations';
import { listPullRequestRows, type PullRequestRow } from './pulls';
import {
  listRecentReleases,
  listReleasesFor,
  type ReleaseRow,
} from './releases';
import type { RepositoryRow } from './repositories';
import {
  listRunSummariesForShas,
  listWorkflowRunRows,
  type WorkflowRunRow,
} from './runs';

/** Dashboard reads. Rows in, wire DTOs out; the dashboard never sees SQL names. */

export function toRepositoryDto(
  row: RepositoryRow,
  followed = false,
): RepositoryDto {
  return {
    followed,
    id: row.id,
    fullName: row.full_name,
    name: row.name,
    owner: row.owner_login,
    htmlUrl: row.html_url,
    description: row.description,
    private: row.private === 1,
    archived: row.archived === 1,
    defaultBranch: row.default_branch,
    head: row.head_sha
      ? {
          sha: row.head_sha,
          message: row.head_message,
          author: row.head_author,
          committedAt: row.head_committed_at,
        }
      : null,
    ci: {
      state: row.ci_state as CiState,
      sha: row.ci_sha,
      updatedAt: row.ci_updated_at,
    },
    ciStale: !!row.ci_sha && !!row.head_sha && row.ci_sha !== row.head_sha,
    openPullRequests: row.open_pr_count,
    version: row.version
      ? {
          value: row.version,
          source: row.version_source === 'tag' ? 'tag' : 'release',
          at: row.version_at,
        }
      : null,
    lastSyncedAt: row.last_synced_at,
  };
}

const toReleaseDto = (row: ReleaseRow, fullName: string): ReleaseDto => ({
  id: row.id,
  repositoryId: row.repository_id,
  repositoryFullName: fullName,
  tag: row.tag_name,
  name: row.name,
  prerelease: row.prerelease === 1,
  htmlUrl: row.html_url,
  publishedAt: row.published_at,
});

const toRunDto = (row: WorkflowRunRow): WorkflowRunDto => ({
  id: row.id,
  name: row.name,
  event: row.event,
  branch: row.branch,
  headSha: row.head_sha,
  status: row.status,
  conclusion: row.conclusion,
  runNumber: row.run_number,
  htmlUrl: row.html_url,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toActivityDto = (row: EventRow): ActivityDto => ({
  id: row.id,
  type: row.type as DomainEventType,
  summary: row.summary,
  actor: row.actor,
  url: row.url,
  repositoryId: row.repository_id,
  repositoryFullName: row.repository_full_name,
  occurredAt: row.occurred_at,
});

function parseLabels(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((l): l is string => typeof l === 'string')
      : [];
  } catch {
    return [];
  }
}

/** Every repository the GitHub App can read ("available"). */
async function allRepositoryRows(db: SqlDatabase): Promise<RepositoryRow[]> {
  const result = await db.sql<
    Rows<RepositoryRow>
  >`SELECT * FROM repositories ORDER BY full_name COLLATE NOCASE`;
  return result.rows ?? [];
}

/** Only the repositories this user follows — what the dashboard is made of. */
async function followedRepositoryRows(
  db: SqlDatabase,
  userId: string,
): Promise<RepositoryRow[]> {
  const result = await db.sql<
    Rows<RepositoryRow>
  >`SELECT r.* FROM repositories r
    WHERE r.id IN (SELECT repository_id FROM followed_repository WHERE user_id = ${userId})
    ORDER BY r.full_name COLLATE NOCASE`;
  return result.rows ?? [];
}

async function followedIds(
  db: SqlDatabase,
  userId: string,
): Promise<Set<number>> {
  const result = await db.sql<
    Rows<{ repository_id: number }>
  >`SELECT repository_id FROM followed_repository WHERE user_id = ${userId}`;
  return new Set((result.rows ?? []).map((row) => row.repository_id));
}

/**
 * `followed` (default) is the personal dashboard; `available` is the full
 * installed inventory for Manage repositories, each flagged with `followed`.
 */
export async function listRepositories(
  db: SqlDatabase,
  userId: string,
  scope: 'followed' | 'available' = 'followed',
): Promise<RepositoryDto[]> {
  if (scope === 'followed') {
    return (await followedRepositoryRows(db, userId)).map((row) =>
      toRepositoryDto(row, true),
    );
  }
  const followed = await followedIds(db, userId);
  return (await allRepositoryRows(db)).map((row) =>
    toRepositoryDto(row, followed.has(row.id)),
  );
}

async function toPullRequestDtos(
  db: SqlDatabase,
  rows: PullRequestRow[],
  names: Map<number, string>,
): Promise<PullRequestDto[]> {
  const runs = await listRunSummariesForShas(db, [
    ...new Set(rows.map((row) => row.repository_id)),
  ]);

  return rows.map((row) => {
    const labels = parseLabels(row.labels);
    const forCommit = runs.get(`${row.repository_id}:${row.head_sha}`) ?? [];
    return {
      id: row.id,
      number: row.number,
      title: row.title,
      repositoryId: row.repository_id,
      repositoryFullName: names.get(row.repository_id) ?? 'unknown',
      author: row.author_login,
      draft: row.draft === 1,
      htmlUrl: row.html_url,
      baseRef: row.base_ref,
      headRef: row.head_ref,
      labels,
      ci: computeCiState(forCommit).state,
      releaseHint: releaseHint(labels, row.head_ref),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

export async function listPullRequests(
  db: SqlDatabase,
  userId: string,
): Promise<PullRequestDto[]> {
  const repositories = await followedRepositoryRows(db, userId);
  const names = new Map(repositories.map((r) => [r.id, r.full_name]));
  return toPullRequestDtos(
    db,
    await listPullRequestRows(db, { userId }),
    names,
  );
}

export async function listActivity(
  db: SqlDatabase,
  userId: string,
  limit = 100,
): Promise<ActivityDto[]> {
  return (await listEvents(db, { userId, limit })).map(toActivityDto);
}

export async function getRepositoryDetail(
  db: SqlDatabase,
  userId: string,
  id: number,
): Promise<RepositoryDetailDto | null> {
  const result = await db.sql<
    Rows<RepositoryRow>
  >`SELECT * FROM repositories WHERE id = ${id}`;
  const row = result.rows?.[0];
  if (!row) return null;

  const names = new Map([[row.id, row.full_name]]);
  return {
    // Reachable whether or not it is followed: a direct link keeps working.
    repository: toRepositoryDto(row, (await followedIds(db, userId)).has(id)),
    pullRequests: await toPullRequestDtos(
      db,
      await listPullRequestRows(db, { repositoryId: id }),
      names,
    ),
    workflowRuns: (await listWorkflowRunRows(db, id)).map(toRunDto),
    releases: (await listReleasesFor(db, id)).map((r) =>
      toReleaseDto(r, row.full_name),
    ),
    activity: (await listEvents(db, { repositoryId: id, limit: 30 })).map(
      toActivityDto,
    ),
  };
}

export async function getOverview(
  db: SqlDatabase,
  userId: string,
  connection: ConnectionDto,
): Promise<OverviewDto> {
  const available = await db.sql<
    Rows<{ total: number }>
  >`SELECT COUNT(*) AS total FROM repositories`;
  const repositories = (await followedRepositoryRows(db, userId)).map((row) =>
    toRepositoryDto(row, true),
  );
  const synced = repositories
    .map((r) => r.lastSyncedAt)
    .filter((v): v is string => v !== null)
    .sort();

  const attention = repositories
    .filter((r) => !r.archived && ciNeedsAttention(r.ci.state))
    // Failing before running.
    .sort(
      (a, b) =>
        Number(b.ci.state === 'failure') - Number(a.ci.state === 'failure'),
    )
    .slice(0, 6);

  return {
    connection,
    totals: {
      repositories: repositories.length,
      availableRepositories: available.rows?.[0]?.total ?? 0,
      openPullRequests: repositories.reduce(
        (n, r) => n + r.openPullRequests,
        0,
      ),
      failing: repositories.filter((r) => r.ci.state === 'failure').length,
      pending: repositories.filter((r) => r.ci.state === 'pending').length,
      noCi: repositories.filter((r) => r.ci.state === 'none').length,
    },
    attention,
    recentReleases: (await listRecentReleases(db, 5, userId)).map((r) =>
      toReleaseDto(r, r.repository_full_name ?? 'unknown'),
    ),
    recentActivity: (await listEvents(db, { userId, limit: 8 })).map(
      toActivityDto,
    ),
    lastSyncedAt: synced.at(-1) ?? null,
  };
}

export async function getSettings(
  db: SqlDatabase,
  userId: string,
  connection: ConnectionDto,
  webhookUrl: string,
): Promise<SettingsDto> {
  const installations = await listInstallations(db);
  const counts = await db.sql<
    Rows<{ installation_id: number; total: number }>
  >`SELECT installation_id, COUNT(*) AS total FROM repositories GROUP BY installation_id`;
  const perInstallation = new Map(
    (counts.rows ?? []).map((row) => [row.installation_id, row.total]),
  );

  const dtos: InstallationDto[] = installations.map((row) => ({
    id: row.id,
    account: row.account_login,
    accountType: row.account_type,
    repositorySelection: row.repository_selection,
    suspended: row.suspended_at !== null,
    repositories: perInstallation.get(row.id) ?? 0,
    lastSyncedAt: row.last_synced_at,
    syncError: row.sync_error,
  }));

  const stamps = dtos
    .map((i) => i.lastSyncedAt)
    .filter((v): v is string => v !== null)
    .sort();

  return {
    connection,
    installations: dtos,
    /** Everything the installations can read — not what this user follows. */
    repositories: dtos.reduce((n, i) => n + i.repositories, 0),
    followedRepositories: await countFollowed(db, userId),
    lastSyncedAt: stamps.at(-1) ?? null,
    setup: {
      webhookUrl,
      callbackNote:
        'The GitHub App needs no user-authorization callback: DevRadar signs users in through DevAuth and reads GitHub only as the App installation.',
    },
  };
}
