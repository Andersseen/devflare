import {
  createFakeGitHub,
  emptyWorld,
  ghCommit,
  ghInstallation,
  ghPull,
  ghRepo,
  ghRun,
  repoState,
  testPrivateKeyPem,
} from '../../testing/fake-github';
import { createGitHubApi } from './api';
import { parseNextLink } from './client';
import {
  GitHubApiError,
  GitHubRateLimitError,
  RequestBudgetExhaustedError,
} from './errors';

function setup(budget = 100) {
  const world = emptyWorld();
  world.installations = [ghInstallation(10, 'acme')];
  const fake = createFakeGitHub(world);
  const sleeps: number[] = [];
  const api = createGitHubApi({
    appId: '1',
    privateKey: testPrivateKeyPem(),
    fetch: fake.fetch,
    budget: { remaining: budget },
    sleep: async (ms) => void sleeps.push(ms),
    now: () => Date.parse('2026-10-12T12:00:00Z'),
  });
  return { world, fake, api, sleeps };
}

describe('GitHub API client', () => {
  it('follows Link headers across every page of repositories', async () => {
    const { world, api } = setup();
    world.repositories[10] = [
      [repoState({ repo: ghRepo(1, 'acme/a') })],
      [repoState({ repo: ghRepo(2, 'acme/b') })],
      [repoState({ repo: ghRepo(3, 'acme/c') })],
    ];
    const token = await api.installationToken(10);
    const repos = await api.listInstallationRepositories(token);
    expect(repos.map((r) => r.full_name)).toEqual([
      'acme/a',
      'acme/b',
      'acme/c',
    ]);
  });

  it('paginates pull requests and stops at the page cap', async () => {
    const { world, fake, api } = setup();
    world.repositories[10] = [
      [
        repoState({
          repo: ghRepo(1, 'acme/a'),
          pulls: [
            [ghPull(1)],
            [ghPull(2)],
            [ghPull(3)],
            [ghPull(4)],
            [ghPull(5)],
          ],
        }),
      ],
    ];
    const token = await api.installationToken(10);
    const pulls = await api.listOpenPullRequests(token, 'acme/a');
    expect(pulls).toHaveLength(3); // MAX_PR_PAGES
    expect(fake.calls.filter((c) => c.endsWith('/pulls'))).toHaveLength(3);
  });

  it('authenticates app calls with a JWT and repo calls with the installation token', async () => {
    const { world, fake, api } = setup();
    world.repositories[10] = [[repoState({ repo: ghRepo(1, 'acme/a') })]];
    const token = await api.installationToken(10);
    await api.listInstallationRepositories(token);
    expect(fake.authorizations[0]).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/); // JWT
    expect(fake.authorizations[1]).toBe(`Bearer ${token}`);
  });

  it('is read-only: the only non-GET is the installation token exchange', async () => {
    const { world, fake, api } = setup();
    world.repositories[10] = [
      [repoState({ repo: ghRepo(1, 'acme/a'), runs: [ghRun(1)] })],
    ];
    await api.listInstallations();
    const token = await api.installationToken(10);
    await api.listInstallationRepositories(token);
    await api.getHeadCommit(token, 'acme/a', 'main');
    await api.listOpenPullRequests(token, 'acme/a');
    await api.listWorkflowRuns(token, 'acme/a');
    await api.listReleases(token, 'acme/a');
    await api.latestTag(token, 'acme/a');
    const writes = fake.calls.filter((c) => !c.startsWith('GET '));
    expect(writes).toEqual(['POST /app/installations/10/access_tokens']);
  });

  it('returns null for an empty repository (409) instead of failing the sync', async () => {
    const { world, api } = setup();
    world.repositories[10] = [
      [repoState({ repo: ghRepo(1, 'acme/a'), commit: null })],
    ];
    const token = await api.installationToken(10);
    await expect(
      api.getHeadCommit(token, 'acme/a', 'main'),
    ).resolves.toBeNull();
  });

  it('returns the head commit when there is one', async () => {
    const { world, api } = setup();
    world.repositories[10] = [
      [repoState({ repo: ghRepo(1, 'acme/a'), commit: ghCommit('abc') })],
    ];
    const token = await api.installationToken(10);
    await expect(
      api.getHeadCommit(token, 'acme/a', 'main'),
    ).resolves.toMatchObject({ sha: 'abc' });
  });

  it('reports unreadable Actions as null (CI becomes "unknown"), not as an error', async () => {
    const { world, api } = setup();
    world.repositories[10] = [
      [repoState({ repo: ghRepo(1, 'acme/a'), runs: null })],
    ];
    const token = await api.installationToken(10);
    await expect(api.listWorkflowRuns(token, 'acme/a')).resolves.toBeNull();
  });

  it('surfaces other failures with status and path, never the token', async () => {
    const { api } = setup();
    const token = await api.installationToken(10);
    const error = await api
      .listReleases(token, 'acme/missing')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GitHubApiError);
    expect((error as GitHubApiError).status).toBe(404);
    expect((error as Error).message).not.toContain(token);
  });
});

describe('rate limits, retries and budget', () => {
  it('turns a primary rate limit (403 + remaining 0) into GitHubRateLimitError with the reset time', async () => {
    const { world, api } = setup();
    world.failures['/app/installations'] = () =>
      new Response('{}', {
        status: 403,
        headers: {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': '1800000000',
        },
      });
    const error = await api.listInstallations().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GitHubRateLimitError);
    expect((error as GitHubRateLimitError).resetAt).toBe(
      new Date(1_800_000_000_000).toISOString(),
    );
  });

  it('honours Retry-After on a secondary rate limit', async () => {
    const { world, api } = setup();
    world.failures['/app/installations'] = () =>
      new Response('{}', { status: 429, headers: { 'retry-after': '60' } });
    const error = (await api
      .listInstallations()
      .catch((e: unknown) => e)) as GitHubRateLimitError;
    expect(error.resetAt).toBe('2026-10-12T12:01:00.000Z');
  });

  it('does not mistake a permissions 403 for a rate limit', async () => {
    const { world, api } = setup();
    world.failures['/app/installations'] = () =>
      new Response('{}', {
        status: 403,
        headers: { 'x-ratelimit-remaining': '4999' },
      });
    const error = await api.listInstallations().catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(GitHubRateLimitError);
    expect((error as GitHubApiError).status).toBe(403);
  });

  it('retries transient 5xx twice with backoff, then succeeds', async () => {
    const { world, fake, api, sleeps } = setup();
    let attempts = 0;
    world.failures['/app/installations'] = () =>
      ++attempts < 3
        ? new Response('{}', { status: 502 })
        : new Response('[]', { status: 200 });
    await expect(api.listInstallations()).resolves.toEqual([]);
    expect(
      fake.calls.filter((c) => c === 'GET /app/installations'),
    ).toHaveLength(3);
    expect(sleeps).toEqual([250, 500]);
  });

  it('gives up after the retries and reports the status', async () => {
    const { world, api } = setup();
    world.failures['/app/installations'] = () =>
      new Response('{}', { status: 503 });
    const error = (await api
      .listInstallations()
      .catch((e: unknown) => e)) as GitHubApiError;
    expect(error.status).toBe(503);
  });

  it('wraps network failures without leaking details', async () => {
    const api = createGitHubApi({
      appId: '1',
      privateKey: testPrivateKeyPem(),
      fetch: async () => {
        throw new TypeError('connect ECONNREFUSED secret-host');
      },
      budget: { remaining: 10 },
      sleep: async () => undefined,
    });
    const error = (await api
      .listInstallations()
      .catch((e: unknown) => e)) as GitHubApiError;
    expect(error.status).toBe(0);
    expect(error.message).not.toContain('secret-host');
  });

  it('stops spending when the request budget is exhausted', async () => {
    const { world, fake, api } = setup(2);
    world.repositories[10] = [[repoState({ repo: ghRepo(1, 'acme/a') })]];
    const token = await api.installationToken(10); // 1
    await api.listInstallationRepositories(token); // 2
    await expect(api.listReleases(token, 'acme/a')).rejects.toBeInstanceOf(
      RequestBudgetExhaustedError,
    );
    expect(fake.calls).toHaveLength(2);
  });
});

describe('parseNextLink', () => {
  it('extracts rel="next" among several relations', () => {
    expect(
      parseNextLink(
        '<https://api.github.com/x?page=1>; rel="prev", <https://api.github.com/x?page=3>; rel="next"',
      ),
    ).toBe('https://api.github.com/x?page=3');
  });
  it('returns null on the last page or no header', () => {
    expect(
      parseNextLink('<https://api.github.com/x?page=1>; rel="prev"'),
    ).toBeNull();
    expect(parseNextLink(null)).toBeNull();
  });
});
