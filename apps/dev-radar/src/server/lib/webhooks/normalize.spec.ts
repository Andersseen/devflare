import { ghInstallation } from '../../testing/fake-github';
import {
  installation,
  installationRepositories,
  pullRequest,
  push,
  release,
  REPO,
} from '../../testing/webhook-payloads';
import {
  normalizeInstallation,
  normalizeInstallationRepositories,
  normalizePullRequest,
  normalizePush,
  normalizeRelease,
} from './normalize';
import type {
  InstallationPayload,
  InstallationRepositoriesPayload,
  PullRequestEvent,
  PushEvent,
  ReleaseEvent,
} from './payloads';

const NOW = '2026-10-12T12:00:00Z';
const as = <T>(value: unknown) => value as T;

describe('event normalization', () => {
  describe('push', () => {
    it('a push to the default branch is repository.main.updated', () => {
      const [event] = normalizePush(as<PushEvent>(push()), NOW);
      expect(event).toMatchObject({
        type: 'repository.main.updated',
        repositoryId: 100,
        repositoryFullName: 'acme/api',
        installationId: 10,
        actor: 'ada',
        occurredAt: '2026-10-12T11:00:00Z',
        data: {
          branch: 'main',
          headSha: 'sha-new',
          commits: 2,
          headMessage: 'feat: ship it',
        },
      });
    });

    it('follows the repository’s configured default branch, not the name "main"', () => {
      const payload = push({
        ref: 'refs/heads/trunk',
        repository: { ...REPO, default_branch: 'trunk' },
      });
      expect(normalizePush(as<PushEvent>(payload), NOW)).toHaveLength(1);
      const onMain = push({ repository: { ...REPO, default_branch: 'trunk' } });
      expect(normalizePush(as<PushEvent>(onMain), NOW)).toEqual([]);
    });

    it('ignores feature branches, tags and branch deletions', () => {
      expect(
        normalizePush(as<PushEvent>(push({ ref: 'refs/heads/feature' })), NOW),
      ).toEqual([]);
      expect(
        normalizePush(as<PushEvent>(push({ ref: 'refs/tags/v1' })), NOW),
      ).toEqual([]);
      expect(
        normalizePush(as<PushEvent>(push({ deleted: true })), NOW),
      ).toEqual([]);
    });

    it('does not claim CI passed: a push is only a push', () => {
      const types = normalizePush(as<PushEvent>(push()), NOW).map(
        (e) => e.type,
      );
      expect(types).toEqual(['repository.main.updated']);
    });
  });

  describe('pull_request', () => {
    it('opened', () => {
      const [event] = normalizePullRequest(
        as<PullRequestEvent>(pullRequest('opened')),
        NOW,
      );
      expect(event).toMatchObject({
        type: 'pull_request.opened',
        data: { number: 7, title: 'Add thing' },
      });
    });

    it('closed + merged is pull_request.merged', () => {
      const payload = pullRequest('closed', { state: 'closed', merged: true });
      const [event] = normalizePullRequest(as<PullRequestEvent>(payload), NOW);
      expect(event).toMatchObject({
        type: 'pull_request.merged',
        data: { baseRef: 'main' },
      });
    });

    it('closed without merge is pull_request.closed — not merged', () => {
      const payload = pullRequest('closed', { state: 'closed', merged: false });
      const [event] = normalizePullRequest(as<PullRequestEvent>(payload), NOW);
      expect(event.type).toBe('pull_request.closed');
    });

    it.each([
      'synchronize',
      'edited',
      'labeled',
      'ready_for_review',
      'reopened',
    ])('%s changes state but emits no feed event', (action) => {
      expect(
        normalizePullRequest(as<PullRequestEvent>(pullRequest(action)), NOW),
      ).toEqual([]);
    });
  });

  describe('release', () => {
    it('published is release.published', () => {
      const [event] = normalizeRelease(
        as<ReleaseEvent>(release('published')),
        NOW,
      );
      expect(event).toMatchObject({
        type: 'release.published',
        data: { tag: 'v1.2.0', prerelease: false },
      });
    });

    it('drafts and other actions are not published releases', () => {
      expect(
        normalizeRelease(
          as<ReleaseEvent>(release('published', { draft: true })),
          NOW,
        ),
      ).toEqual([]);
      expect(
        normalizeRelease(as<ReleaseEvent>(release('created')), NOW),
      ).toEqual([]);
      expect(
        normalizeRelease(as<ReleaseEvent>(release('deleted')), NOW),
      ).toEqual([]);
    });

    it('labels pre-releases', () => {
      const [event] = normalizeRelease(
        as<ReleaseEvent>(release('published', { prerelease: true })),
        NOW,
      );
      expect(event.summary).toContain('pre-release');
    });
  });

  describe('installation', () => {
    it('created / deleted', () => {
      expect(
        normalizeInstallation(
          as<InstallationPayload>(installation('created')),
          NOW,
        )[0],
      ).toMatchObject({
        type: 'installation.created',
        installationId: 10,
        repositoryId: null,
        data: { account: 'acme' },
      });
      expect(
        normalizeInstallation(
          as<InstallationPayload>(installation('deleted')),
          NOW,
        )[0].type,
      ).toBe('installation.deleted');
    });

    it('suspend/unsuspend produce no event', () => {
      expect(
        normalizeInstallation(
          as<InstallationPayload>(installation('suspend')),
          NOW,
        ),
      ).toEqual([]);
    });

    it('repositories added / removed, one event each', () => {
      const payload = installationRepositories('added', {
        repositories_added: [
          { id: 1, full_name: 'acme/a' },
          { id: 2, full_name: 'acme/b' },
        ],
        repositories_removed: [{ id: 3, full_name: 'acme/c' }],
      });
      const events = normalizeInstallationRepositories(
        as<InstallationRepositoriesPayload>(payload),
        NOW,
      );
      expect(events.map((e) => [e.type, e.repositoryFullName])).toEqual([
        ['repository.added', 'acme/a'],
        ['repository.added', 'acme/b'],
        ['repository.removed', 'acme/c'],
      ]);
    });

    it('survives an installation without an account', () => {
      const payload = {
        action: 'created',
        installation: ghInstallation(1, 'x', { account: null }),
      };
      expect(
        normalizeInstallation(as<InstallationPayload>(payload), NOW)[0].summary,
      ).toContain('unknown account');
    });
  });
});
