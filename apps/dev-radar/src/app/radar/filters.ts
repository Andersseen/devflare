import type { CiState } from '../../shared/ci-state';
import type { PullRequestDto, RepositoryDto } from '../../shared/dto';

/** Pure list filtering, shared by the pages and covered by filters.spec.ts. */

export interface RepositoryFilter {
  query: string;
  ci: CiState | 'all';
  visibility: 'all' | 'public' | 'private';
  withOpenPullRequests: boolean;
  showArchived: boolean;
}

export const DEFAULT_REPOSITORY_FILTER: RepositoryFilter = {
  query: '',
  ci: 'all',
  visibility: 'all',
  withOpenPullRequests: false,
  showArchived: false,
};

export function filterRepositories(
  repositories: readonly RepositoryDto[],
  filter: RepositoryFilter,
): RepositoryDto[] {
  const query = filter.query.trim().toLowerCase();
  return repositories.filter((repo) => {
    if (repo.archived && !filter.showArchived) return false;
    if (filter.ci !== 'all' && repo.ci.state !== filter.ci) return false;
    if (filter.visibility === 'public' && repo.private) return false;
    if (filter.visibility === 'private' && !repo.private) return false;
    if (filter.withOpenPullRequests && repo.openPullRequests === 0)
      return false;
    if (!query) return true;
    return (
      repo.fullName.toLowerCase().includes(query) ||
      (repo.description ?? '').toLowerCase().includes(query)
    );
  });
}

export interface PullRequestFilter {
  query: string;
  repositoryId: number | 'all';
  hideDrafts: boolean;
  releaseOnly: boolean;
}

export const DEFAULT_PULL_REQUEST_FILTER: PullRequestFilter = {
  query: '',
  repositoryId: 'all',
  hideDrafts: false,
  releaseOnly: false,
};

export function filterPullRequests(
  pullRequests: readonly PullRequestDto[],
  filter: PullRequestFilter,
): PullRequestDto[] {
  const query = filter.query.trim().toLowerCase();
  return pullRequests.filter((pr) => {
    if (
      filter.repositoryId !== 'all' &&
      pr.repositoryId !== filter.repositoryId
    ) {
      return false;
    }
    if (filter.hideDrafts && pr.draft) return false;
    if (filter.releaseOnly && !pr.releaseHint) return false;
    if (!query) return true;
    return (
      pr.title.toLowerCase().includes(query) ||
      pr.repositoryFullName.toLowerCase().includes(query) ||
      (pr.author ?? '').toLowerCase().includes(query) ||
      String(pr.number) === query.replace(/^#/, '')
    );
  });
}
