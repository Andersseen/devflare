import { emptyLayout, type DashboardLayout } from '@org/dashboard-layout/logic';
import type { Rows, SqlDatabase } from '../../db';

/**
 * Followed repositories and their dashboard layout (spec 022). Items of the
 * shared `DashboardLayout` are repository ids as strings; `hiddenIds` is always
 * empty here — DevRadar's "hide" is *unfollow*, which removes the row.
 *
 * Every function takes the user id and scopes by it in the query itself.
 */

export class LayoutInputError extends Error {}

interface GroupRow {
  id: string;
  name: string;
}
interface FollowRow {
  repository_id: number;
  group_id: string | null;
  pinned: number;
}

/** The user's stored layout. Followed ids with no mirrored repository are skipped. */
export async function getDashboardLayout(
  db: SqlDatabase,
  userId: string,
): Promise<DashboardLayout> {
  const groups = (
    await db.sql<
      Rows<GroupRow>
    >`SELECT id, name FROM dashboard_group WHERE user_id = ${userId} ORDER BY position, created_at, id`
  ).rows;
  const follows = (
    await db.sql<Rows<FollowRow>>`SELECT f.repository_id, f.group_id, f.pinned
      FROM followed_repository f JOIN repositories r ON r.id = f.repository_id
      WHERE f.user_id = ${userId}
      ORDER BY f.position, f.repository_id`
  ).rows;

  const layout = emptyLayout();
  const byGroup = new Map(
    (groups ?? []).map((g) => [
      g.id,
      { id: g.id, name: g.name, itemIds: [] as string[] },
    ]),
  );
  for (const row of follows ?? []) {
    const id = String(row.repository_id);
    const group = row.group_id ? byGroup.get(row.group_id) : undefined;
    (group ? group.itemIds : layout.ungroupedIds).push(id);
    if (row.pinned === 1) layout.pinnedIds.push(id);
  }
  layout.groups = [...byGroup.values()];
  return layout;
}

export async function countFollowed(
  db: SqlDatabase,
  userId: string,
): Promise<number> {
  const result = await db.sql<
    Rows<{ total: number }>
  >`SELECT COUNT(*) AS total FROM followed_repository f
    JOIN repositories r ON r.id = f.repository_id WHERE f.user_id = ${userId}`;
  return result.rows?.[0]?.total ?? 0;
}

/**
 * Replaces the user's whole layout: the followed set is exactly the items in
 * `layout`. The order of statements keeps every intermediate state valid —
 * groups and follows are upserted first, stale rows pruned last — so a reader
 * (or a crash between statements) never sees an empty dashboard.
 */
export async function saveDashboardLayout(
  db: SqlDatabase,
  userId: string,
  layout: DashboardLayout,
  now: Date = new Date(),
): Promise<void> {
  const createdAt = now.toISOString();
  const pinned = new Set(layout.pinnedIds);

  const groups = layout.groups.map((g, position) => ({
    id: g.id,
    name: g.name,
    position,
  }));
  const follows = [
    ...layout.ungroupedIds.map((id, position) => ({
      id: Number(id),
      group: null as string | null,
      position,
      pinned: pinned.has(id) ? 1 : 0,
    })),
    ...layout.groups.flatMap((g) =>
      g.itemIds.map((id, position) => ({
        id: Number(id),
        group: g.id as string | null,
        position,
        pinned: pinned.has(id) ? 1 : 0,
      })),
    ),
  ];
  if (follows.some((f) => !Number.isSafeInteger(f.id) || f.id <= 0)) {
    throw new LayoutInputError('Invalid repository id');
  }

  // Only repositories DevRadar has actually mirrored can be followed.
  const ids = JSON.stringify(follows.map((f) => f.id));
  const known = await db.sql<Rows<{ total: number }>>`SELECT COUNT(*) AS total
    FROM repositories WHERE id IN (SELECT value FROM json_each(${ids}))`;
  if ((known.rows?.[0]?.total ?? 0) !== follows.length) {
    throw new LayoutInputError('Unknown repository in the layout');
  }

  const groupJson = JSON.stringify(groups);
  await db.sql`INSERT INTO dashboard_group (id, user_id, name, position, created_at)
    SELECT json_extract(value, '$.id'), ${userId}, json_extract(value, '$.name'),
      json_extract(value, '$.position'), ${createdAt}
    FROM json_each(${groupJson}) WHERE true
    ON CONFLICT (id) DO UPDATE SET name = excluded.name, position = excluded.position
      WHERE dashboard_group.user_id = ${userId}`;

  // A group id that already belongs to someone else was not upserted above.
  const mine = await db.sql<Rows<{ total: number }>>`SELECT COUNT(*) AS total
    FROM dashboard_group WHERE user_id = ${userId}
      AND id IN (SELECT json_extract(value, '$.id') FROM json_each(${groupJson}))`;
  if ((mine.rows?.[0]?.total ?? 0) !== groups.length) {
    throw new LayoutInputError('Invalid group id');
  }

  const followJson = JSON.stringify(follows);
  await db.sql`INSERT INTO followed_repository
      (user_id, repository_id, group_id, position, pinned, created_at)
    SELECT ${userId}, json_extract(value, '$.id'), json_extract(value, '$.group'),
      json_extract(value, '$.position'), json_extract(value, '$.pinned'), ${createdAt}
    FROM json_each(${followJson}) WHERE true
    ON CONFLICT (user_id, repository_id) DO UPDATE SET
      group_id = excluded.group_id, position = excluded.position, pinned = excluded.pinned`;

  await db.sql`DELETE FROM followed_repository WHERE user_id = ${userId}
    AND repository_id NOT IN (SELECT value FROM json_each(${ids}))`;
  await db.sql`DELETE FROM dashboard_group WHERE user_id = ${userId}
    AND id NOT IN (SELECT json_extract(value, '$.id') FROM json_each(${groupJson}))`;
}

/**
 * "Restore default layout": keeps what the user follows, drops groups and pins
 * and orders the repositories by name. It never unfollows anything — that is a
 * deliberate action in Manage repositories.
 */
export async function resetDashboardLayout(
  db: SqlDatabase,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  const rows = (
    await db.sql<Rows<{ repository_id: number }>>`SELECT f.repository_id
      FROM followed_repository f JOIN repositories r ON r.id = f.repository_id
      WHERE f.user_id = ${userId} ORDER BY r.full_name COLLATE NOCASE`
  ).rows;
  await saveDashboardLayout(
    db,
    userId,
    {
      ...emptyLayout(),
      ungroupedIds: (rows ?? []).map((row) => String(row.repository_id)),
    },
    now,
  );
}
