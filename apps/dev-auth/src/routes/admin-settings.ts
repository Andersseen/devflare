/**
 * Reading and writing the provider's own configuration: the GitHub OAuth App
 * credentials and who may sign up.
 *
 * Same authorization as ../routes/admin-clients.ts and the same audit trail —
 * settings rows are recorded with a null `clientId`. Changing who may sign in to
 * the provider is at least as consequential as changing a client, so it is
 * attributable in exactly the same way.
 *
 * The GitHub client secret is write-only through this API. It is stored sealed
 * (../lib/secret-box.ts) and reported only as `configured: true`; there is no
 * endpoint that returns it, because the point of sealing it is that a read of
 * the database is not enough to have it.
 */

import { Hono } from 'hono';

import type { Env } from '../index';
import { createDb } from '../db';
import { oauthClientAudit, providerSetting } from '../db/schema';
import { authenticateAdmin, hasCsrfHeader, type Actor } from '../lib/admin';
import { seal } from '../lib/secret-box';
import {
  SETTING_KEYS,
  getProviderSettings,
  parseAllowlist,
  resetProviderSettingsCache,
} from '../lib/provider-settings';

const adminSettingsRoutes = new Hono<{ Bindings: Env }>();

adminSettingsRoutes.use('*', async (c, next) => {
  const result = await authenticateAdmin(c);
  if (!result.ok) return c.json({ error: result.error }, result.status);

  if (
    c.req.method !== 'GET' &&
    result.actor.via === 'session' &&
    !hasCsrfHeader(c)
  ) {
    return c.json({ error: 'missing x-devauth-admin header' }, 403);
  }

  c.set('actor' as never, result.actor as never);
  await next();
});

function actorOf(c: { get: (key: never) => unknown }): Actor {
  return c.get('actor' as never) as Actor;
}

async function writeSetting(
  db: ReturnType<typeof createDb>,
  key: string,
  value: string | null,
  actor: Actor,
  encrypted = false,
): Promise<void> {
  const row = {
    key,
    value,
    encrypted,
    updatedAt: new Date(),
    updatedBy: actor.email,
  };

  await db
    .insert(providerSetting)
    .values(row)
    .onConflictDoUpdate({ target: providerSetting.key, set: row });
}

async function audit(
  db: ReturnType<typeof createDb>,
  actor: Actor,
  action: string,
  changes: unknown,
): Promise<void> {
  try {
    await db.insert(oauthClientAudit).values({
      id: crypto.randomUUID(),
      actorUserId: actor.userId ?? null,
      actorEmail: actor.email,
      action,
      // Settings are not about one client; the column stays null.
      clientId: null,
      changes: JSON.stringify(changes),
      createdAt: new Date(),
    });
  } catch (error) {
    console.error('[admin-settings] failed to write audit row', error);
  }
}

adminSettingsRoutes.get('/', async (c) => {
  const settings = await getProviderSettings(c.env);

  return c.json({
    github: {
      clientId: settings.github.clientId,
      // Never the value, in any form. Only whether one resolved at all.
      secretConfigured: Boolean(settings.github.clientSecret),
      enabled: settings.github.enabled,
    },
    signup: {
      allowlist: settings.signupAllowlist,
      restricted: settings.signupRestricted,
    },
  });
});

interface GithubInput {
  clientId?: unknown;
  clientSecret?: unknown;
  enabled?: unknown;
}

adminSettingsRoutes.patch('/github', async (c) => {
  const body = (await c.req.json().catch(() => null)) as GithubInput | null;
  if (!body) return c.json({ error: 'expected a JSON body' }, 400);

  const db = createDb(c.env.DB);
  const actor = actorOf(c);
  const changed: string[] = [];

  if (typeof body.clientId === 'string') {
    await writeSetting(
      db,
      SETTING_KEYS.githubClientId,
      body.clientId.trim(),
      actor,
    );
    changed.push('clientId');
  }

  if (typeof body.clientSecret === 'string' && body.clientSecret.trim()) {
    if (!c.env.SECRET_ENCRYPTION_KEY) {
      // Storing it in the clear because a key is missing would quietly downgrade
      // the guarantee the caller is relying on.
      return c.json(
        {
          error:
            'SECRET_ENCRYPTION_KEY is not set; refusing to store a secret unencrypted',
        },
        503,
      );
    }

    const sealed = await seal(
      body.clientSecret.trim(),
      c.env.SECRET_ENCRYPTION_KEY,
    );
    await writeSetting(
      db,
      SETTING_KEYS.githubClientSecret,
      sealed,
      actor,
      true,
    );
    // Records that it was set, never the value.
    changed.push('clientSecret');
  }

  if (typeof body.enabled === 'boolean') {
    await writeSetting(
      db,
      SETTING_KEYS.githubEnabled,
      body.enabled ? 'true' : 'false',
      actor,
    );
    changed.push('enabled');
  }

  if (changed.length === 0) {
    return c.json({ error: 'nothing to update' }, 400);
  }

  await audit(db, actor, 'settings.github', { changed });
  // The next request must see this, not the memo from before the write.
  resetProviderSettingsCache();

  const settings = await getProviderSettings(c.env);
  return c.json({
    changed,
    github: {
      clientId: settings.github.clientId,
      secretConfigured: Boolean(settings.github.clientSecret),
      enabled: settings.github.enabled,
    },
  });
});

adminSettingsRoutes.get('/allowlist', async (c) => {
  const settings = await getProviderSettings(c.env);
  return c.json({
    allowlist: settings.signupAllowlist,
    restricted: settings.signupRestricted,
  });
});

adminSettingsRoutes.put('/allowlist', async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    allowlist?: unknown;
  } | null;
  if (!body || !Array.isArray(body.allowlist)) {
    return c.json({ error: 'expected { allowlist: string[] }' }, 400);
  }

  const addresses = body.allowlist.filter(
    (entry): entry is string => typeof entry === 'string',
  );
  const invalid = addresses.filter((address) => !address.includes('@'));
  if (invalid.length) {
    return c.json({ error: `not email addresses: ${invalid.join(', ')}` }, 400);
  }

  const normalised = parseAllowlist(addresses.join(','));

  // An empty list is allowed and means nobody may sign up. That is a real
  // choice, distinct from having no row at all, so it is stored rather than
  // rejected — but the caller is told, because it locks out new accounts.
  const db = createDb(c.env.DB);
  const actor = actorOf(c);
  const previous = await getProviderSettings(c.env);

  await writeSetting(
    db,
    SETTING_KEYS.signupAllowlist,
    normalised.join(','),
    actor,
  );
  await audit(db, actor, 'settings.allowlist', {
    from: previous.signupAllowlist,
    to: normalised,
  });
  resetProviderSettingsCache();

  return c.json({
    allowlist: normalised,
    restricted: true,
    closedToNewSignups: normalised.length === 0,
  });
});

export default adminSettingsRoutes;
