import type { Rows, SqlDatabase } from '../../db';
import type {
  DomainEvent,
  DomainEventSink,
} from '../../../shared/domain-events';

export interface EventRow {
  id: number;
  repository_id: number | null;
  repository_full_name: string | null;
  type: string;
  summary: string;
  actor: string | null;
  url: string | null;
  occurred_at: string;
}

/**
 * v0.1.0's only DomainEventSink: persist to the Activity feed. A retried
 * delivery cannot duplicate an event (unique on delivery id + type).
 */
export function createEventStoreSink(
  db: SqlDatabase,
  now: () => Date = () => new Date(),
): DomainEventSink {
  return {
    async publish(events, deliveryId) {
      const createdAt = now().toISOString();
      for (const event of events) {
        await db.sql`INSERT OR IGNORE INTO repository_events
            (repository_id, repository_full_name, installation_id, type, summary, actor,
             url, data, delivery_id, occurred_at, created_at)
          VALUES (${event.repositoryId}, ${event.repositoryFullName}, ${event.installationId},
            ${event.type}, ${event.summary}, ${event.actor}, ${event.url},
            ${JSON.stringify(event.data)}, ${deliveryId}, ${event.occurredAt}, ${createdAt})`;
      }
    },
  };
}

export type { DomainEvent };

export async function listEvents(
  db: SqlDatabase,
  options: { repositoryId?: number; limit: number },
): Promise<EventRow[]> {
  const result =
    options.repositoryId === undefined
      ? await db.sql<
          Rows<EventRow>
        >`SELECT id, repository_id, repository_full_name, type, summary, actor, url, occurred_at
          FROM repository_events ORDER BY occurred_at DESC, id DESC LIMIT ${options.limit}`
      : await db.sql<
          Rows<EventRow>
        >`SELECT id, repository_id, repository_full_name, type, summary, actor, url, occurred_at
          FROM repository_events WHERE repository_id = ${options.repositoryId}
          ORDER BY occurred_at DESC, id DESC LIMIT ${options.limit}`;
  return result.rows ?? [];
}
