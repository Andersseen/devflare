import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { audit } from '../audit';
import { createDb } from '../../db';
import {
  createTestD1,
  MIGRATIONS,
  type TestD1,
} from '../../__tests__/helpers/d1';
import type { Actor } from '../admin';

let d1: TestD1;
const actor: Actor = {
  email: 'owner@devflare.test',
  userId: 'u1',
  via: 'session',
};

beforeEach(() => {
  d1 = createTestD1(MIGRATIONS);
});

afterEach(() => d1.close());

describe('audit()', () => {
  it('writes the expected row shape', async () => {
    const db = createDb(d1.binding);

    await audit(db, actor, {
      action: 'ban',
      targetType: 'user',
      targetId: 'user-1',
      changes: { reason: 'spam' },
    });

    const row = d1.sqlite
      .prepare('SELECT * FROM oauthClientAudit')
      .get() as Record<string, unknown>;

    expect(row).toMatchObject({
      actorUserId: 'u1',
      actorEmail: actor.email,
      action: 'ban',
      targetType: 'user',
      clientId: 'user-1',
      changes: JSON.stringify({ reason: 'spam' }),
    });
  });

  it('stores a null target and null changes when omitted', async () => {
    const db = createDb(d1.binding);

    await audit(db, actor, {
      action: 'settings.github',
      targetType: 'settings',
    });

    const row = d1.sqlite
      .prepare('SELECT clientId, changes FROM oauthClientAudit')
      .get() as { clientId: string | null; changes: string | null };

    expect(row).toEqual({ clientId: null, changes: null });
  });

  it('logs and does not throw when the write fails', async () => {
    const db = createDb(d1.binding);
    d1.close(); // any insert against a closed database now fails

    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      audit(db, actor, { action: 'ban', targetType: 'user', targetId: 'x' }),
    ).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();

    spy.mockRestore();
    // Re-open so the shared afterEach's close() doesn't double-close.
    d1 = createTestD1(MIGRATIONS);
  });
});
