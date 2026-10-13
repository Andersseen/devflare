import type { PullRequestDto, RepositoryDto } from '../../shared/dto';
import {
  DEFAULT_PULL_REQUEST_FILTER,
  DEFAULT_REPOSITORY_FILTER,
  filterPullRequests,
  filterRepositories,
} from './filters';

function repo(
  over: Partial<RepositoryDto> & { id: number; fullName: string },
): RepositoryDto {
  return {
    followed: true,
    name: over.fullName.split('/')[1],
    owner: over.fullName.split('/')[0],
    htmlUrl: `https://github.com/${over.fullName}`,
    description: null,
    private: false,
    archived: false,
    defaultBranch: 'main',
    head: null,
    ci: { state: 'success', sha: null, updatedAt: null },
    ciStale: false,
    openPullRequests: 0,
    version: null,
    lastSyncedAt: null,
    ...over,
  };
}

function pr(over: Partial<PullRequestDto> & { id: number }): PullRequestDto {
  return {
    number: over.id,
    title: 'Change',
    repositoryId: 1,
    repositoryFullName: 'acme/api',
    author: 'ada',
    draft: false,
    htmlUrl: 'https://github.com/acme/api/pull/1',
    baseRef: 'main',
    headRef: 'feature',
    labels: [],
    ci: 'none',
    releaseHint: null,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    ...over,
  };
}

const REPOS = [
  repo({
    id: 1,
    fullName: 'acme/api',
    description: 'Billing API',
    openPullRequests: 2,
  }),
  repo({
    id: 2,
    fullName: 'acme/web',
    private: true,
    ci: { state: 'failure', sha: null, updatedAt: null },
  }),
  repo({ id: 3, fullName: 'acme/old', archived: true }),
  repo({
    id: 4,
    fullName: 'acme/docs',
    ci: { state: 'none', sha: null, updatedAt: null },
  }),
];

describe('filterRepositories', () => {
  const ids = (list: RepositoryDto[]) => list.map((r) => r.id);

  it('hides archived repositories unless asked', () => {
    expect(ids(filterRepositories(REPOS, DEFAULT_REPOSITORY_FILTER))).toEqual([
      1, 2, 4,
    ]);
    expect(
      ids(
        filterRepositories(REPOS, {
          ...DEFAULT_REPOSITORY_FILTER,
          showArchived: true,
        }),
      ),
    ).toEqual([1, 2, 3, 4]);
  });

  it('searches name and description, case-insensitively', () => {
    expect(
      ids(
        filterRepositories(REPOS, {
          ...DEFAULT_REPOSITORY_FILTER,
          query: ' BILLING ',
        }),
      ),
    ).toEqual([1]);
    expect(
      ids(
        filterRepositories(REPOS, {
          ...DEFAULT_REPOSITORY_FILTER,
          query: 'acme/we',
        }),
      ),
    ).toEqual([2]);
  });

  it('filters by CI state without treating "no CI" as passing', () => {
    expect(
      ids(
        filterRepositories(REPOS, {
          ...DEFAULT_REPOSITORY_FILTER,
          ci: 'success',
        }),
      ),
    ).toEqual([1]);
    expect(
      ids(
        filterRepositories(REPOS, { ...DEFAULT_REPOSITORY_FILTER, ci: 'none' }),
      ),
    ).toEqual([4]);
    expect(
      ids(
        filterRepositories(REPOS, {
          ...DEFAULT_REPOSITORY_FILTER,
          ci: 'failure',
        }),
      ),
    ).toEqual([2]);
  });

  it('filters by visibility and open PRs', () => {
    expect(
      ids(
        filterRepositories(REPOS, {
          ...DEFAULT_REPOSITORY_FILTER,
          visibility: 'private',
        }),
      ),
    ).toEqual([2]);
    expect(
      ids(
        filterRepositories(REPOS, {
          ...DEFAULT_REPOSITORY_FILTER,
          withOpenPullRequests: true,
        }),
      ),
    ).toEqual([1]);
  });
});

describe('filterPullRequests', () => {
  const PRS = [
    pr({ id: 10, title: 'Add billing', author: 'ada' }),
    pr({
      id: 11,
      title: 'WIP',
      draft: true,
      repositoryId: 2,
      repositoryFullName: 'acme/web',
    }),
    pr({
      id: 12,
      title: 'chore: release 1.2.0',
      releaseHint: 'label “release”',
      author: 'bot',
    }),
  ];
  const ids = (list: PullRequestDto[]) => list.map((p) => p.id);

  it('matches title, repository, author and #number', () => {
    expect(
      ids(
        filterPullRequests(PRS, {
          ...DEFAULT_PULL_REQUEST_FILTER,
          query: 'billing',
        }),
      ),
    ).toEqual([10]);
    expect(
      ids(
        filterPullRequests(PRS, {
          ...DEFAULT_PULL_REQUEST_FILTER,
          query: 'acme/web',
        }),
      ),
    ).toEqual([11]);
    expect(
      ids(
        filterPullRequests(PRS, {
          ...DEFAULT_PULL_REQUEST_FILTER,
          query: 'bot',
        }),
      ),
    ).toEqual([12]);
    expect(
      ids(
        filterPullRequests(PRS, {
          ...DEFAULT_PULL_REQUEST_FILTER,
          query: '#11',
        }),
      ),
    ).toEqual([11]);
  });

  it('hides drafts and isolates release PRs by grounded hint only', () => {
    expect(
      ids(
        filterPullRequests(PRS, {
          ...DEFAULT_PULL_REQUEST_FILTER,
          hideDrafts: true,
        }),
      ),
    ).toEqual([10, 12]);
    expect(
      ids(
        filterPullRequests(PRS, {
          ...DEFAULT_PULL_REQUEST_FILTER,
          releaseOnly: true,
        }),
      ),
    ).toEqual([12]);
  });

  it('filters by repository', () => {
    expect(
      ids(
        filterPullRequests(PRS, {
          ...DEFAULT_PULL_REQUEST_FILTER,
          repositoryId: 2,
        }),
      ),
    ).toEqual([11]);
  });
});
