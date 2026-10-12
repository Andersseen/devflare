import { must } from '../../testing/must';
import {
  ghCommit,
  ghInstallation,
  ghPull,
  ghRelease,
  ghRepo,
  ghRun,
} from '../../testing/fake-github';
import {
  firstLine,
  mapCommit,
  mapInstallation,
  mapPullRequest,
  mapRelease,
  mapRepository,
  mapWorkflowRun,
  pickVersion,
} from './mapping';

describe('GitHub response mapping', () => {
  it('maps a repository keyed by its stable id, with the owner login', () => {
    expect(
      mapRepository(ghRepo(42, 'acme/api', { private: true }), 7),
    ).toMatchObject({
      id: 42,
      installationId: 7,
      ownerLogin: 'acme',
      fullName: 'acme/api',
      private: true,
      defaultBranch: 'main',
    });
  });

  it('keeps only the first line of a commit message and caps its length', () => {
    expect(firstLine('feat: x\n\nlong body')).toBe('feat: x');
    expect(firstLine('a'.repeat(500))?.length).toBe(200);
    expect(firstLine('  \n x')).toBeNull();
    expect(firstLine(null)).toBeNull();
  });

  it('maps a commit, preferring the GitHub login over the git author name', () => {
    expect(mapCommit(ghCommit('abc'))).toEqual({
      sha: 'abc',
      message: 'feat: something',
      author: 'ada',
      committedAt: '2026-10-01T10:00:00Z',
    });
    const noLogin = { ...ghCommit('abc'), author: null };
    expect(mapCommit(noLogin).author).toBe('Ada');
  });

  it('maps pull requests, flattening labels and defaulting draft to false', () => {
    const gh = ghPull(5, { labels: [{ name: 'release' }], draft: undefined });
    expect(mapPullRequest(gh, 1)).toMatchObject({
      id: 5,
      repositoryId: 1,
      draft: false,
      labels: ['release'],
      headSha: 'sha-pr-5',
    });
    expect(mapPullRequest(ghPull(6, { user: null }), 1).authorLogin).toBeNull();
  });

  it('maps workflow runs, tolerating null name/status', () => {
    const run = mapWorkflowRun(
      ghRun(9, {
        name: null,
        status: null,
        conclusion: null,
        run_attempt: undefined,
      }),
      1,
    );
    expect(run).toMatchObject({
      name: 'Workflow 1',
      status: 'queued',
      runAttempt: 1,
      conclusion: null,
    });
  });

  it('drops draft and unpublished releases', () => {
    expect(mapRelease(ghRelease(1, 'v1', { draft: true }), 1)).toBeNull();
    expect(
      mapRelease(ghRelease(1, 'v1', { published_at: null }), 1),
    ).toBeNull();
    expect(mapRelease(ghRelease(1, 'v1'), 1)).toMatchObject({ tagName: 'v1' });
  });

  it('ignores an installation with no account', () => {
    expect(
      mapInstallation(ghInstallation(1, 'x', { account: null })),
    ).toBeNull();
    expect(mapInstallation(ghInstallation(1, 'acme'))).toMatchObject({
      accountLogin: 'acme',
    });
  });
});

describe('pickVersion', () => {
  const release = (id: number, tag: string, prerelease = false) =>
    must(mapRelease(ghRelease(id, tag, { prerelease }), 1));

  it('prefers the latest stable release over a newer pre-release', () => {
    expect(
      pickVersion(
        [release(2, 'v2.0.0-rc.1', true), release(1, 'v1.9.0')],
        'v3',
      ),
    ).toMatchObject({
      value: 'v1.9.0',
      source: 'release',
    });
  });

  it('falls back to a pre-release, then to the newest tag', () => {
    expect(pickVersion([release(1, 'v2.0.0-rc.1', true)], null)?.value).toBe(
      'v2.0.0-rc.1',
    );
    expect(pickVersion([], 'v0.3.0')).toEqual({
      value: 'v0.3.0',
      source: 'tag',
      at: null,
    });
  });

  it('is null with neither releases nor tags', () => {
    expect(pickVersion([], null)).toBeNull();
  });
});
