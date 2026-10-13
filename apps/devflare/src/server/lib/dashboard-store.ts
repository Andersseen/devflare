import { emptyLayout, type DashboardLayout } from '@org/dashboard-layout/logic';
import { db } from '../db';
import { rowsOf } from './project-rows';

/**
 * Dashboard customization queries (spec 022). Every function takes the user id
 * and scopes by it in the SQL. Nothing here reads or writes `project_resource`:
 * visual grouping and Cloudflare ownership are separate concepts.
 */

export class DashboardInputError extends Error {}

const SAVED_KEY = /^saved:([0-9a-fA-F-]{8,64})$/;

interface GroupRow {
  id: string;
  name: string;
}
interface ItemRow {
  itemKey: string;
  groupId: string | null;
  hidden: number;
}

/** True when the user has saved a layout at all (drives "Restore default"). */
export async function getLayout(
  userId: string,
): Promise<{ layout: DashboardLayout; customized: boolean }> {
  const groups = rowsOf<GroupRow>(
    await db.sql`SELECT id, name FROM dashboard_group WHERE userId = ${userId} ORDER BY position, createdAt, id`,
  );
  const items = rowsOf<ItemRow>(
    await db.sql`SELECT itemKey, groupId, hidden FROM dashboard_item WHERE userId = ${userId} ORDER BY position, itemKey`,
  );

  const layout = emptyLayout();
  const byGroup = new Map(
    groups.map((g) => [
      g.id,
      { id: g.id, name: g.name, itemIds: [] as string[] },
    ]),
  );
  for (const item of items) {
    if (item.hidden === 1) {
      layout.hiddenIds.push(item.itemKey);
      continue;
    }
    const group = item.groupId ? byGroup.get(item.groupId) : undefined;
    (group ? group.itemIds : layout.ungroupedIds).push(item.itemKey);
  }
  layout.groups = [...byGroup.values()];
  return { layout, customized: groups.length > 0 || items.length > 0 };
}

/**
 * Replaces the user's layout. Saved-project keys must belong to the caller;
 * every statement is parameterized (arrays travel as JSON through json_each).
 * Upserts first, prunes last, so each intermediate state is a valid layout.
 */
export async function saveLayout(
  userId: string,
  layout: DashboardLayout,
  now: Date = new Date(),
): Promise<void> {
  const createdAt = now.toISOString();
  const keys = [
    ...layout.ungroupedIds,
    ...layout.groups.flatMap((g) => g.itemIds),
    ...layout.hiddenIds,
  ];

  const savedIds = keys
    .map((key) => SAVED_KEY.exec(key)?.[1])
    .filter((id): id is string => id !== undefined);
  if (savedIds.length) {
    const owned = rowsOf<{ total: number }>(
      await db.sql`SELECT COUNT(*) AS total FROM projects
        WHERE userId = ${userId} AND id IN (SELECT value FROM json_each(${JSON.stringify(savedIds)}))`,
    );
    if ((owned[0]?.total ?? 0) !== new Set(savedIds).size) {
      throw new DashboardInputError('Unknown project in the layout');
    }
  }

  const groups = layout.groups.map((g, position) => ({
    id: g.id,
    name: g.name,
    position,
  }));
  const items = [
    ...layout.ungroupedIds.map((key, position) => ({
      key,
      group: null as string | null,
      position,
      hidden: 0,
    })),
    ...layout.groups.flatMap((g) =>
      g.itemIds.map((key, position) => ({
        key,
        group: g.id as string | null,
        position,
        hidden: 0,
      })),
    ),
    ...layout.hiddenIds.map((key, position) => ({
      key,
      group: null as string | null,
      position,
      hidden: 1,
    })),
  ];

  const groupJson = JSON.stringify(groups);
  await db.sql`INSERT INTO dashboard_group (id, userId, name, position, createdAt)
    SELECT json_extract(value, '$.id'), ${userId}, json_extract(value, '$.name'),
      json_extract(value, '$.position'), ${createdAt}
    FROM json_each(${groupJson}) WHERE true
    ON CONFLICT (id) DO UPDATE SET name = excluded.name, position = excluded.position
      WHERE dashboard_group.userId = ${userId}`;

  // A group id owned by someone else was not upserted above; refuse it.
  const mine = rowsOf<{ total: number }>(
    await db.sql`SELECT COUNT(*) AS total FROM dashboard_group WHERE userId = ${userId}
      AND id IN (SELECT json_extract(value, '$.id') FROM json_each(${groupJson}))`,
  );
  if ((mine[0]?.total ?? 0) !== groups.length) {
    throw new DashboardInputError('Invalid group id');
  }

  const itemJson = JSON.stringify(items);
  await db.sql`INSERT INTO dashboard_item (userId, itemKey, groupId, position, hidden, createdAt)
    SELECT ${userId}, json_extract(value, '$.key'), json_extract(value, '$.group'),
      json_extract(value, '$.position'), json_extract(value, '$.hidden'), ${createdAt}
    FROM json_each(${itemJson}) WHERE true
    ON CONFLICT (userId, itemKey) DO UPDATE SET
      groupId = excluded.groupId, position = excluded.position, hidden = excluded.hidden`;

  await db.sql`DELETE FROM dashboard_item WHERE userId = ${userId}
    AND itemKey NOT IN (SELECT json_extract(value, '$.key') FROM json_each(${itemJson}))`;
  await db.sql`DELETE FROM dashboard_group WHERE userId = ${userId}
    AND id NOT IN (SELECT json_extract(value, '$.id') FROM json_each(${groupJson}))`;
}

/** "Restore default layout": forgets every stored arrangement for this user. */
export async function resetLayout(userId: string): Promise<void> {
  await db.sql`DELETE FROM dashboard_item WHERE userId = ${userId}`;
  await db.sql`DELETE FROM dashboard_group WHERE userId = ${userId}`;
}

export interface IdentityOverride {
  slug: string;
  name: string;
  aliases: string[];
  removed: boolean;
}

interface IdentityRow {
  slug: string;
  name: string;
  aliases: string;
  removed: number;
}

export async function getIdentityOverrides(
  userId: string,
): Promise<IdentityOverride[]> {
  const rows = rowsOf<IdentityRow>(
    await db.sql`SELECT slug, name, aliases, removed FROM discovery_identity WHERE userId = ${userId} ORDER BY slug`,
  );
  return rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    aliases: parseAliases(row.aliases),
    removed: row.removed === 1,
  }));
}

/** Replaces the user's overrides wholesale (the client sends only differences). */
export async function saveIdentityOverrides(
  userId: string,
  overrides: readonly IdentityOverride[],
  now: Date = new Date(),
): Promise<void> {
  const updatedAt = now.toISOString();
  const json = JSON.stringify(
    overrides.map((o) => ({
      slug: o.slug,
      name: o.name,
      aliases: JSON.stringify(o.aliases),
      removed: o.removed ? 1 : 0,
    })),
  );
  await db.sql`INSERT INTO discovery_identity (userId, slug, name, aliases, removed, updatedAt)
    SELECT ${userId}, json_extract(value, '$.slug'), json_extract(value, '$.name'),
      json_extract(value, '$.aliases'), json_extract(value, '$.removed'), ${updatedAt}
    FROM json_each(${json}) WHERE true
    ON CONFLICT (userId, slug) DO UPDATE SET
      name = excluded.name, aliases = excluded.aliases, removed = excluded.removed,
      updatedAt = excluded.updatedAt`;
  await db.sql`DELETE FROM discovery_identity WHERE userId = ${userId}
    AND slug NOT IN (SELECT json_extract(value, '$.slug') FROM json_each(${json}))`;
}

export async function resetIdentityOverrides(userId: string): Promise<void> {
  await db.sql`DELETE FROM discovery_identity WHERE userId = ${userId}`;
}

function parseAliases(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((alias): alias is string => typeof alias === 'string')
      : [];
  } catch {
    return [];
  }
}

const IDENTITY_SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const MAX_IDENTITIES = 100;
const MAX_ALIASES = 20;
const MAX_TEXT = 60;

/** Validates an untrusted identity list. Throws DashboardInputError. */
export function parseIdentityOverrides(input: unknown): IdentityOverride[] {
  if (typeof input !== 'object' || input === null) {
    throw new DashboardInputError('Body must be an object');
  }
  const list = (input as { identities?: unknown }).identities;
  if (!Array.isArray(list) || list.length > MAX_IDENTITIES) {
    throw new DashboardInputError('identities must be a short list');
  }

  const seen = new Set<string>();
  return list.map((raw): IdentityOverride => {
    if (typeof raw !== 'object' || raw === null) {
      throw new DashboardInputError('Invalid identity');
    }
    const { slug, name, aliases, removed } = raw as Record<string, unknown>;
    if (
      typeof slug !== 'string' ||
      !IDENTITY_SLUG.test(slug) ||
      seen.has(slug)
    ) {
      throw new DashboardInputError('Invalid identity slug');
    }
    seen.add(slug);
    const cleanName =
      typeof name === 'string' ? name.replace(/\s+/g, ' ').trim() : '';
    if (!cleanName || cleanName.length > MAX_TEXT) {
      throw new DashboardInputError('Invalid identity name');
    }
    if (
      !Array.isArray(aliases) ||
      aliases.length > MAX_ALIASES ||
      aliases.some(
        (a) => typeof a !== 'string' || a.trim() === '' || a.length > MAX_TEXT,
      )
    ) {
      throw new DashboardInputError('Invalid aliases');
    }
    if (removed !== undefined && typeof removed !== 'boolean') {
      throw new DashboardInputError('Invalid removed flag');
    }
    return {
      slug,
      name: cleanName,
      aliases: [...new Set((aliases as string[]).map((a) => a.trim()))],
      removed: removed === true,
    };
  });
}
