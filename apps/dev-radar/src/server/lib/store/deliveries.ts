import type { Rows, SqlDatabase } from '../../db';

/**
 * Webhook idempotency. GitHub redelivers on timeouts and on manual request;
 * the delivery id (`X-GitHub-Delivery`) is the key. Processing is *also*
 * idempotent on its own (guarded upserts, unique event index), so the rare
 * race of two simultaneous identical deliveries is harmless.
 */

export const MAX_DELIVERY_ATTEMPTS = 5;
/** A delivery stuck in "received" this long is assumed to have crashed. */
export const IN_FLIGHT_MS = 5 * 60 * 1000;

export type Claim =
  | { kind: 'process'; attempt: number }
  | { kind: 'duplicate' }
  | { kind: 'in_progress' }
  | { kind: 'abandoned' };

interface DeliveryRow {
  status: string;
  attempts: number;
  received_at: string;
}

export interface DeliveryMeta {
  event: string;
  action: string | null;
  installationId: number | null;
  repositoryId: number | null;
}

export async function claimDelivery(
  db: SqlDatabase,
  deliveryId: string,
  meta: DeliveryMeta,
  now: Date,
): Promise<Claim> {
  const nowIso = now.toISOString();
  const existing = await db.sql<
    Rows<DeliveryRow>
  >`SELECT status, attempts, received_at FROM webhook_deliveries WHERE delivery_id = ${deliveryId}`;
  const row = existing.rows?.[0];

  if (!row) {
    await db.sql`INSERT OR IGNORE INTO webhook_deliveries
        (delivery_id, event, action, installation_id, repository_id, status, attempts, received_at)
      VALUES (${deliveryId}, ${meta.event}, ${meta.action}, ${meta.installationId},
        ${meta.repositoryId}, 'received', 1, ${nowIso})`;
    return { kind: 'process', attempt: 1 };
  }

  if (row.status === 'processed' || row.status === 'ignored') {
    return { kind: 'duplicate' };
  }

  if (
    row.status === 'received' &&
    now.getTime() - Date.parse(row.received_at) < IN_FLIGHT_MS
  ) {
    return { kind: 'in_progress' };
  }

  if (row.attempts >= MAX_DELIVERY_ATTEMPTS) return { kind: 'abandoned' };

  const attempt = row.attempts + 1;
  await db.sql`UPDATE webhook_deliveries SET status = 'received', attempts = ${attempt}, received_at = ${nowIso}, error = NULL WHERE delivery_id = ${deliveryId}`;
  return { kind: 'process', attempt };
}

export async function finishDelivery(
  db: SqlDatabase,
  deliveryId: string,
  outcome: {
    status: 'processed' | 'ignored' | 'failed';
    error?: string;
    repositoryId?: number | null;
    installationId?: number | null;
  },
  now: Date,
): Promise<void> {
  await db.sql`UPDATE webhook_deliveries SET status = ${outcome.status}, error = ${outcome.error ?? null},
      repository_id = COALESCE(${outcome.repositoryId ?? null}, repository_id),
      installation_id = COALESCE(${outcome.installationId ?? null}, installation_id),
      processed_at = ${now.toISOString()}
    WHERE delivery_id = ${deliveryId}`;
}
