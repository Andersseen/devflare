import { must } from '../../testing/must';
import type {
  DomainEvent,
  DomainEventSink,
} from '../../../shared/domain-events';
import { ghInstallation, ghRepo } from '../../testing/fake-github';
import { createTestDb, NOW } from '../../testing/test-db';
import {
  installation,
  installationRepositories,
  pullRequest,
  push,
  release,
  workflowRun,
} from '../../testing/webhook-payloads';
import { createEventStoreSink } from '../store/events';
import { MAX_DELIVERY_ATTEMPTS } from '../store/deliveries';
import { upsertInstallation } from '../store/installations';
import { upsertRepository } from '../store/repositories';
import { mapInstallation, mapRepository } from '../github/mapping';
import {
  processWebhook,
  WebhookProcessingError,
  type WebhookDeps,
} from './process';

function setup() {
  const { raw, db } = createTestDb();
  const scheduled: number[] = [];
  const published: DomainEvent[] = [];
  const store = createEventStoreSink(db, () => NOW);
  const sink: DomainEventSink = {
    async publish(events, deliveryId) {
      published.push(...events);
      await store.publish(events, deliveryId);
    },
  };
  const deps: WebhookDeps = {
    db,
    sink,
    now: () => NOW,
    scheduleSync: (id) => void scheduled.push(id),
    shouldPrune: () => false,
  };
  let n = 0;
  const deliver = (event: string, payload: unknown, deliveryId = `d-${++n}`) =>
    processWebhook(deps, { deliveryId, event, payload });

  const row = <T>(sql: string, ...values: unknown[]) =>
    raw.prepare(sql).all(...values)[0] as T | undefined;
  const rows = <T>(sql: string, ...values: unknown[]) =>
    raw.prepare(sql).all(...values) as T[];

  return { raw, db, deps, deliver, scheduled, published, row, rows };
}

async function seedRepository(
  t: ReturnType<typeof setup>,
  extra: Partial<ReturnType<typeof mapRepository>> = {},
) {
  await upsertInstallation(
    t.db,
    must(mapInstallation(ghInstallation(10, 'acme'))),
    NOW.toISOString(),
  );
  await upsertRepository(
    t.db,
    { ...mapRepository(ghRepo(100, 'acme/api'), 10), ...extra },
    NOW.toISOString(),
  );
}

describe('webhook processing', () => {
  describe('idempotency', () => {
    it('processes a delivery once; a replay is a duplicate with no second effect', async () => {
      const t = setup();
      await seedRepository(t);

      expect((await t.deliver('push', push(), 'same-id')).result).toBe(
        'processed',
      );
      expect((await t.deliver('push', push(), 'same-id')).result).toBe(
        'duplicate',
      );
      expect((await t.deliver('push', push(), 'same-id')).result).toBe(
        'duplicate',
      );

      expect(t.rows('SELECT * FROM repository_events')).toHaveLength(1);
      expect(
        t.row<{ n: number }>('SELECT COUNT(*) n FROM webhook_deliveries')?.n,
      ).toBe(1);
    });

    it('a failed delivery can be redelivered and then succeeds exactly once', async () => {
      const t = setup();
      await seedRepository(t);
      let fail = true;
      const flaky: DomainEventSink = {
        publish: async (events, id) => {
          if (fail) throw new Error('boom: secret payload fragment');
          await createEventStoreSink(t.db, () => NOW).publish(events, id);
        },
      };
      const deps = { ...t.deps, sink: flaky };

      await expect(
        processWebhook(deps, {
          deliveryId: 'x',
          event: 'push',
          payload: push(),
        }),
      ).rejects.toBeInstanceOf(WebhookProcessingError);
      const failed = t.row<{ status: string; error: string; attempts: number }>(
        "SELECT status, error, attempts FROM webhook_deliveries WHERE delivery_id = 'x'",
      );
      expect(failed).toMatchObject({ status: 'failed', attempts: 1 });
      expect(failed?.error).toBe('processing failed'); // fixed string, no payload fragments

      fail = false;
      await expect(
        processWebhook(deps, {
          deliveryId: 'x',
          event: 'push',
          payload: push(),
        }),
      ).resolves.toEqual({
        result: 'processed',
      });
      expect(t.rows('SELECT * FROM repository_events')).toHaveLength(1);
      expect(
        t.row<{ attempts: number }>(
          "SELECT attempts FROM webhook_deliveries WHERE delivery_id = 'x'",
        )?.attempts,
      ).toBe(2);
    });

    it('gives up after the maximum number of attempts', async () => {
      const t = setup();
      await seedRepository(t);
      const broken: DomainEventSink = {
        publish: async () => {
          throw new Error('x');
        },
      };
      const deps = { ...t.deps, sink: broken };
      for (let i = 0; i < MAX_DELIVERY_ATTEMPTS; i++) {
        await expect(
          processWebhook(deps, {
            deliveryId: 'z',
            event: 'push',
            payload: push(),
          }),
        ).rejects.toThrow();
      }
      await expect(
        processWebhook(deps, {
          deliveryId: 'z',
          event: 'push',
          payload: push(),
        }),
      ).resolves.toEqual({
        result: 'abandoned',
      });
    });

    it('reports a fresh in-flight delivery as in_progress, and retakes a stale one', async () => {
      const t = setup();
      t.raw
        .prepare(
          "INSERT INTO webhook_deliveries (delivery_id, event, status, attempts, received_at) VALUES ('f', 'push', 'received', 1, ?)",
        )
        .run(new Date(NOW.getTime() - 1000).toISOString());
      expect((await t.deliver('ping', {}, 'f')).result).toBe('in_progress');

      t.raw
        .prepare(
          "UPDATE webhook_deliveries SET received_at = ? WHERE delivery_id = 'f'",
        )
        .run(new Date(NOW.getTime() - 10 * 60 * 1000).toISOString());
      expect((await t.deliver('ping', {}, 'f')).result).toBe('ignored');
    });
  });

  describe('push', () => {
    it('updates the default branch head and emits repository.main.updated', async () => {
      const t = setup();
      await seedRepository(t);
      await t.deliver('push', push());

      expect(
        t.row(
          'SELECT head_sha, head_message, head_author FROM repositories WHERE id = 100',
        ),
      ).toEqual({
        head_sha: 'sha-new',
        head_message: 'feat: ship it',
        head_author: 'ada',
      });
      expect(t.published.map((e) => e.type)).toEqual([
        'repository.main.updated',
      ]);
    });

    it('does not touch CI: a pushed commit has no verdict yet', async () => {
      const t = setup();
      await seedRepository(t);
      await t.deliver(
        'workflow_run',
        workflowRun('completed', { head_sha: 'sha-old' }),
      );
      await t.deliver('push', push());
      expect(
        t.row(
          'SELECT ci_state, ci_sha, head_sha FROM repositories WHERE id = 100',
        ),
      ).toEqual({
        ci_state: 'success',
        ci_sha: 'sha-old',
        head_sha: 'sha-new', // CI describes an older commit: the UI shows that as stale
      });
    });

    it('ignores pushes to other branches', async () => {
      const t = setup();
      await seedRepository(t);
      const result = await t.deliver(
        'push',
        push({ ref: 'refs/heads/feature' }),
      );
      expect(result).toEqual({
        result: 'ignored',
        reason: 'not_default_branch',
      });
      expect(t.published).toEqual([]);
      expect(t.row('SELECT head_sha FROM repositories WHERE id = 100')).toEqual(
        { head_sha: null },
      );
    });

    it('never moves the head backwards on an out-of-order delivery', async () => {
      const t = setup();
      await seedRepository(t);
      await t.deliver('push', push());
      await t.deliver(
        'push',
        push({
          after: 'sha-older',
          head_commit: {
            id: 'sha-older',
            message: 'older',
            timestamp: '2026-10-01T00:00:00Z',
          },
        }),
      );
      expect(t.row('SELECT head_sha FROM repositories WHERE id = 100')).toEqual(
        { head_sha: 'sha-new' },
      );
    });

    it('asks for a sync of an installation’s repository it has never seen', async () => {
      const t = setup();
      await upsertInstallation(
        t.db,
        must(mapInstallation(ghInstallation(10, 'acme'))),
        NOW.toISOString(),
      );
      const result = await t.deliver('push', push());
      expect(result).toEqual({
        result: 'ignored',
        reason: 'unknown_repository',
      });
      expect(t.scheduled).toEqual([10]);
    });

    it('applies a rename carried in the payload (ids are stable, names are not)', async () => {
      const t = setup();
      await seedRepository(t);
      const renamed = {
        ...push().repository,
        name: 'api-v2',
        full_name: 'acme/api-v2',
      };
      await t.deliver('push', push({ repository: renamed }));
      expect(
        t.row('SELECT name, full_name FROM repositories WHERE id = 100'),
      ).toEqual({
        name: 'api-v2',
        full_name: 'acme/api-v2',
      });
    });
  });

  describe('pull_request', () => {
    it('opened: stores the PR, recounts, emits the event', async () => {
      const t = setup();
      await seedRepository(t);
      await t.deliver('pull_request', pullRequest('opened'));
      expect(
        t.row('SELECT number, title FROM pull_requests WHERE id = 7'),
      ).toEqual({ number: 7, title: 'Add thing' });
      expect(
        t.row('SELECT open_pr_count FROM repositories WHERE id = 100'),
      ).toEqual({ open_pr_count: 1 });
      expect(t.published.map((e) => e.type)).toEqual(['pull_request.opened']);
    });

    it('closed + merged: removes the PR and emits pull_request.merged', async () => {
      const t = setup();
      await seedRepository(t);
      await t.deliver('pull_request', pullRequest('opened'));
      await t.deliver(
        'pull_request',
        pullRequest('closed', { state: 'closed', merged: true }),
      );
      expect(t.rows('SELECT * FROM pull_requests')).toEqual([]);
      expect(
        t.row('SELECT open_pr_count FROM repositories WHERE id = 100'),
      ).toEqual({ open_pr_count: 0 });
      expect(t.published.map((e) => e.type)).toEqual([
        'pull_request.opened',
        'pull_request.merged',
      ]);
    });

    it('a stale update cannot overwrite a newer one', async () => {
      const t = setup();
      await seedRepository(t);
      await t.deliver(
        'pull_request',
        pullRequest('edited', {
          title: 'Newest',
          updated_at: '2026-10-10T00:00:00Z',
        }),
      );
      await t.deliver(
        'pull_request',
        pullRequest('edited', {
          title: 'Older',
          updated_at: '2026-10-05T00:00:00Z',
        }),
      );
      expect(t.row('SELECT title FROM pull_requests WHERE id = 7')).toEqual({
        title: 'Newest',
      });
    });
  });

  describe('workflow_run → CI state and events', () => {
    it('does not announce CI until every workflow of the commit has concluded', async () => {
      const t = setup();
      await seedRepository(t);
      await t.deliver(
        'workflow_run',
        workflowRun('completed', { id: 1, workflow_id: 1 }),
      );
      expect(t.published.map((e) => e.type)).toEqual(['repository.ci.passed']);

      // A second workflow of a NEWER commit starts: pending, no event.
      await t.deliver(
        'workflow_run',
        workflowRun('in_progress', {
          id: 2,
          workflow_id: 2,
          head_sha: 'sha-next',
          status: 'in_progress',
          conclusion: null,
          created_at: '2026-10-02T00:00:00Z',
          updated_at: '2026-10-02T00:00:00Z',
        }),
      );
      expect(
        t.row('SELECT ci_state, ci_sha FROM repositories WHERE id = 100'),
      ).toEqual({ ci_state: 'pending', ci_sha: 'sha-next' });
      expect(t.published.map((e) => e.type)).toEqual(['repository.ci.passed']);
    });

    it('failed workflow → repository.ci.failed (once, not per redelivery of state)', async () => {
      const t = setup();
      await seedRepository(t);
      await t.deliver(
        'workflow_run',
        workflowRun('completed', { conclusion: 'failure' }),
      );
      await t.deliver(
        'workflow_run',
        workflowRun('completed', {
          id: 501,
          workflow_id: 2,
          conclusion: 'failure',
        }),
      );
      expect(t.published.map((e) => e.type)).toEqual(['repository.ci.failed']);
      expect(t.row('SELECT ci_state FROM repositories WHERE id = 100')).toEqual(
        { ci_state: 'failure' },
      );
    });

    it('a passing re-run flips failure to success and announces it', async () => {
      const t = setup();
      await seedRepository(t);
      await t.deliver(
        'workflow_run',
        workflowRun('completed', { conclusion: 'failure', run_attempt: 1 }),
      );
      await t.deliver(
        'workflow_run',
        workflowRun('completed', {
          conclusion: 'success',
          run_attempt: 2,
          updated_at: '2026-10-01T11:00:00Z',
        }),
      );
      expect(t.published.map((e) => e.type)).toEqual([
        'repository.ci.failed',
        'repository.ci.passed',
      ]);
    });

    it('runs on feature branches and pull_request runs do not decide the default branch', async () => {
      const t = setup();
      await seedRepository(t);
      await t.deliver(
        'workflow_run',
        workflowRun('completed', {
          id: 10,
          head_branch: 'feature',
          conclusion: 'failure',
        }),
      );
      await t.deliver(
        'workflow_run',
        workflowRun('completed', {
          id: 11,
          head_branch: 'main',
          event: 'pull_request',
          conclusion: 'failure',
        }),
      );
      expect(t.row('SELECT ci_state FROM repositories WHERE id = 100')).toEqual(
        { ci_state: 'none' },
      );
      expect(t.published).toEqual([]);
    });

    it('keeps only the latest 50 runs per repository', async () => {
      const t = setup();
      await seedRepository(t);
      for (let i = 1; i <= 55; i++) {
        await t.deliver(
          'workflow_run',
          workflowRun('completed', {
            id: i,
            created_at: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(),
            updated_at: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(),
          }),
        );
      }
      expect(
        t.row<{ n: number }>('SELECT COUNT(*) n FROM workflow_runs')?.n,
      ).toBe(50);
      expect(t.row('SELECT MIN(id) m FROM workflow_runs')).toEqual({ m: 6 });
    });
  });

  describe('release', () => {
    it('published: stores it, sets the version, emits release.published', async () => {
      const t = setup();
      await seedRepository(t);
      await t.deliver('release', release('published'));
      expect(
        t.row(
          'SELECT version, version_source FROM repositories WHERE id = 100',
        ),
      ).toEqual({
        version: 'v1.2.0',
        version_source: 'release',
      });
      expect(t.published.map((e) => e.type)).toEqual(['release.published']);
    });

    it('draft releases are not stored', async () => {
      const t = setup();
      await seedRepository(t);
      const result = await t.deliver(
        'release',
        release('created', { draft: true }),
      );
      expect(result.result).toBe('ignored');
      expect(t.rows('SELECT * FROM releases')).toEqual([]);
    });

    it('deleted: removes it and recomputes the version', async () => {
      const t = setup();
      await seedRepository(t);
      await t.deliver('release', release('published'));
      await t.deliver('release', release('deleted'));
      expect(t.rows('SELECT * FROM releases')).toEqual([]);
      expect(t.row('SELECT version FROM repositories WHERE id = 100')).toEqual({
        version: null,
      });
    });
  });

  describe('installation events', () => {
    it('created: stores the installation, schedules the initial sync, emits the event', async () => {
      const t = setup();
      await t.deliver('installation', installation('created'));
      expect(
        t.row('SELECT account_login FROM github_installations WHERE id = 10'),
      ).toEqual({ account_login: 'acme' });
      expect(t.scheduled).toEqual([10]);
      expect(t.published.map((e) => e.type)).toEqual(['installation.created']);
    });

    it('deleted: cascades to the installation’s mirrored data', async () => {
      const t = setup();
      await seedRepository(t);
      await t.deliver('pull_request', pullRequest('opened'));
      await t.deliver('installation', installation('deleted'));
      for (const table of [
        'github_installations',
        'repositories',
        'pull_requests',
      ]) {
        expect(t.rows(`SELECT * FROM ${table}`)).toEqual([]);
      }
      expect(t.published.map((e) => e.type)).toContain('installation.deleted');
    });

    it('suspend / unsuspend toggle the flag; unsuspend re-syncs', async () => {
      const t = setup();
      await t.deliver('installation', installation('created'));
      t.scheduled.length = 0;
      await t.deliver('installation', installation('suspend'));
      expect(
        t.row<{ suspended_at: string | null }>(
          'SELECT suspended_at FROM github_installations WHERE id = 10',
        )?.suspended_at,
      ).not.toBeNull();
      await t.deliver('installation', installation('unsuspend'));
      expect(
        t.row('SELECT suspended_at FROM github_installations WHERE id = 10'),
      ).toEqual({ suspended_at: null });
      expect(t.scheduled).toEqual([10]);
    });

    it('installation_repositories removed: drops the repository; added: schedules a sync', async () => {
      const t = setup();
      await seedRepository(t);
      await t.deliver(
        'installation_repositories',
        installationRepositories('removed', {
          repositories_removed: [{ id: 100, full_name: 'acme/api' }],
        }),
      );
      expect(t.rows('SELECT * FROM repositories')).toEqual([]);
      expect(t.published.map((e) => e.type)).toEqual(['repository.removed']);

      await t.deliver(
        'installation_repositories',
        installationRepositories('added', {
          repositories_added: [{ id: 101, full_name: 'acme/new' }],
        }),
      );
      expect(t.scheduled).toEqual([10]);
    });
  });

  describe('everything else', () => {
    it('ping and unsubscribed events are recorded as ignored', async () => {
      const t = setup();
      expect(await t.deliver('ping', { zen: 'x' })).toEqual({
        result: 'ignored',
        reason: 'ping',
      });
      expect(await t.deliver('star', { action: 'created' })).toEqual({
        result: 'ignored',
        reason: 'unsupported_event',
      });
      expect(
        t
          .rows('SELECT status FROM webhook_deliveries')
          .every((r) => (r as { status: string }).status === 'ignored'),
      ).toBe(true);
    });

    it('malformed payloads for a supported event are ignored, not crashed on', async () => {
      const t = setup();
      for (const event of [
        'push',
        'pull_request',
        'workflow_run',
        'release',
        'installation',
        'installation_repositories',
      ]) {
        expect(await t.deliver(event, { nonsense: true })).toEqual({
          result: 'ignored',
          reason: 'malformed_payload',
        });
      }
      expect(await t.deliver('push', null)).toEqual({
        result: 'ignored',
        reason: 'malformed_payload',
      });
    });

    it('never stores the payload', async () => {
      const t = setup();
      await seedRepository(t);
      await t.deliver('push', push({ marker: 'TOP-SECRET-PAYLOAD-MARKER' }));
      const dump = JSON.stringify([
        ...t.rows('SELECT * FROM webhook_deliveries'),
        ...t.rows('SELECT * FROM repository_events'),
      ]);
      expect(dump).not.toContain('TOP-SECRET-PAYLOAD-MARKER');
    });
  });
});
