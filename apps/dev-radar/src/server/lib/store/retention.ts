import type { SqlDatabase } from '../../db';

/**
 * Retention for the two append-only tables. Called after webhook processing
 * and at the end of each sync, so no scheduler of its own is needed; each
 * statement is one indexed delete.
 *
 *   webhook_deliveries — 14 days (long enough to cover GitHub's redelivery
 *                        window and any debugging; the payload is never kept)
 *   repository_events  — 30 days, and at most 200 per repository
 *   app_session        — expired rows
 */
export const DELIVERY_RETENTION_DAYS = 14;
export const EVENT_RETENTION_DAYS = 30;
export const EVENTS_KEPT_PER_REPOSITORY = 200;

const DAY_MS = 24 * 60 * 60 * 1000;

export async function pruneHistory(
  db: SqlDatabase,
  now: Date = new Date(),
): Promise<void> {
  const deliveries = new Date(
    now.getTime() - DELIVERY_RETENTION_DAYS * DAY_MS,
  ).toISOString();
  const events = new Date(
    now.getTime() - EVENT_RETENTION_DAYS * DAY_MS,
  ).toISOString();

  await db.sql`DELETE FROM webhook_deliveries WHERE received_at < ${deliveries}`;
  await db.sql`DELETE FROM repository_events WHERE occurred_at < ${events}`;
  await db.sql`DELETE FROM repository_events WHERE repository_id IS NOT NULL AND id NOT IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY repository_id ORDER BY occurred_at DESC, id DESC) AS position
      FROM repository_events WHERE repository_id IS NOT NULL
    ) WHERE position <= ${EVENTS_KEPT_PER_REPOSITORY}
  )`;
  await db.sql`DELETE FROM app_session WHERE expires_at < ${now.toISOString()}`;
}
