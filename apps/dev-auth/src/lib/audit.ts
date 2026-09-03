/**
 * The one place every admin router writes to `oauthClientAudit` (see that
 * table's docstring in ../db/schema.ts for why the name outlived its original
 * scope). Previously copy-pasted once per router (spec 002, spec 003); spec
 * 011 adds two more callers (users, sessions), which is what made the
 * duplication worth ending.
 *
 * Failing to write the audit row must not fail the request that already
 * succeeded — the alternative is an action that took effect but reports an
 * error, which is worse than an unaudited success. So this logs and returns
 * rather than throwing.
 */

import { createDb } from '../db';
import { oauthClientAudit } from '../db/schema';
import type { Actor } from './admin';

export type AuditTargetType = 'client' | 'settings' | 'user' | 'session';

export interface AuditEntry {
  action: string;
  targetType: AuditTargetType;
  /** The client id, user id or session id this action was about. */
  targetId?: string | null;
  /** The changed fields, before/after. Never a secret, token or password. */
  changes?: unknown;
}

export async function audit(
  db: ReturnType<typeof createDb>,
  actor: Actor,
  entry: AuditEntry,
): Promise<void> {
  try {
    await db.insert(oauthClientAudit).values({
      id: crypto.randomUUID(),
      actorUserId: actor.userId ?? null,
      actorEmail: actor.email,
      action: entry.action,
      targetType: entry.targetType,
      clientId: entry.targetId ?? null,
      changes:
        entry.changes === undefined ? null : JSON.stringify(entry.changes),
      createdAt: new Date(),
    });
  } catch (error) {
    console.error(`[audit] failed to write row for "${entry.action}"`, error);
  }
}
