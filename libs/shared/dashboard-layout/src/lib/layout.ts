/**
 * Product-neutral dashboard layout (spec 022).
 *
 * A layout is only *presentation*: which items are visible, in which named
 * group, in which order. It never says what an item is or who owns it — items
 * are opaque string ids supplied by the product (a DevFlare project key, a
 * DevRadar GitHub repository id).
 *
 * Every operation is pure and immutable. An invalid operation (unknown item,
 * unknown group, empty name, …) returns the layout it was given — the same
 * reference — so callers can detect "nothing happened" with `===` and the UI
 * never lands in a half-applied state.
 */

/** Section id of the implicit group items live in until moved to a named one. */
export const UNGROUPED = 'ungrouped';

export const MAX_GROUPS = 20;
export const MAX_GROUP_NAME_LENGTH = 40;

export interface LayoutGroup {
  id: string;
  name: string;
  itemIds: string[];
}

export interface DashboardLayout {
  /** User-defined groups, in display order. */
  groups: LayoutGroup[];
  /** Visible items that are in no named group, in display order. */
  ungroupedIds: string[];
  /** Items the user hid. Kept (not pruned) so they can come back. */
  hiddenIds: string[];
  /** Pinned items; a pinned item is also placed in a group or ungrouped. */
  pinnedIds: string[];
}

export const emptyLayout = (): DashboardLayout => ({
  groups: [],
  ungroupedIds: [],
  hiddenIds: [],
  pinnedIds: [],
});

/** The first-run layout: everything visible, ungrouped, in the given order. */
export function defaultLayout(itemIds: readonly string[]): DashboardLayout {
  return { ...emptyLayout(), ungroupedIds: [...new Set(itemIds)] };
}

export function normalizeGroupName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, MAX_GROUP_NAME_LENGTH);
}

/** Where a visible item lives: a group id, `UNGROUPED`, or null when absent. */
export function sectionOf(
  layout: DashboardLayout,
  itemId: string,
): string | null {
  if (layout.ungroupedIds.includes(itemId)) return UNGROUPED;
  return layout.groups.find((g) => g.itemIds.includes(itemId))?.id ?? null;
}

export function visibleIds(layout: DashboardLayout): string[] {
  return [...layout.ungroupedIds, ...layout.groups.flatMap((g) => g.itemIds)];
}

export function isHidden(layout: DashboardLayout, itemId: string): boolean {
  return layout.hiddenIds.includes(itemId);
}

export function isPinned(layout: DashboardLayout, itemId: string): boolean {
  return layout.pinnedIds.includes(itemId);
}

function without(list: readonly string[], itemId: string): string[] {
  return list.filter((id) => id !== itemId);
}

function insertAt(
  list: readonly string[],
  itemId: string,
  index?: number,
): string[] {
  const at =
    index === undefined
      ? list.length
      : Math.max(0, Math.min(index, list.length));
  return [...list.slice(0, at), itemId, ...list.slice(at)];
}

function listOf(layout: DashboardLayout, section: string): string[] | null {
  if (section === UNGROUPED) return layout.ungroupedIds;
  return layout.groups.find((g) => g.id === section)?.itemIds ?? null;
}

function withList(
  layout: DashboardLayout,
  section: string,
  ids: string[],
): DashboardLayout {
  if (section === UNGROUPED) return { ...layout, ungroupedIds: ids };
  return {
    ...layout,
    groups: layout.groups.map((g) =>
      g.id === section ? { ...g, itemIds: ids } : g,
    ),
  };
}

/**
 * Moves a visible item into `toSection` (a group id or `UNGROUPED`).
 *
 * `index` is a position in the target list **as displayed before the move**
 * (what a drop handler measures); when the item is moving down within its own
 * list the removal shifts it, which is corrected here. Omit it to append.
 */
export function moveItem(
  layout: DashboardLayout,
  itemId: string,
  toSection: string,
  index?: number,
): DashboardLayout {
  const from = sectionOf(layout, itemId);
  const target = listOf(layout, toSection);
  if (from === null || target === null) return layout;

  const source = listOf(layout, from) as string[];
  let at = index;
  if (at !== undefined && from === toSection) {
    const current = source.indexOf(itemId);
    if (at > current) at -= 1;
    if (at === current) return layout;
  }

  const removed = withList(layout, from, without(source, itemId));
  const base = listOf(removed, toSection) as string[];
  return withList(removed, toSection, insertAt(base, itemId, at));
}

/** One step up (-1) or down (+1) inside the item's own list. */
export function nudgeItem(
  layout: DashboardLayout,
  itemId: string,
  delta: -1 | 1,
): DashboardLayout {
  const section = sectionOf(layout, itemId);
  if (section === null) return layout;
  const list = listOf(layout, section) as string[];
  const from = list.indexOf(itemId);
  const to = from + delta;
  if (to < 0 || to >= list.length) return layout;
  const next = [...list];
  [next[from], next[to]] = [next[to], next[from]];
  return withList(layout, section, next);
}

/** Hides a visible item. Its group and position are forgotten; it is not deleted anywhere. */
export function hideItem(
  layout: DashboardLayout,
  itemId: string,
): DashboardLayout {
  const from = sectionOf(layout, itemId);
  if (from === null) return layout;
  const hidden = withList(
    layout,
    from,
    without(listOf(layout, from) as string[], itemId),
  );
  return { ...hidden, hiddenIds: [...hidden.hiddenIds, itemId] };
}

/** Brings a hidden item back at the end of `toSection` (default: ungrouped). */
export function showItem(
  layout: DashboardLayout,
  itemId: string,
  toSection = UNGROUPED,
): DashboardLayout {
  if (!isHidden(layout, itemId) || listOf(layout, toSection) === null)
    return layout;
  const shown = { ...layout, hiddenIds: without(layout.hiddenIds, itemId) };
  return withList(shown, toSection, [
    ...(listOf(shown, toSection) as string[]),
    itemId,
  ]);
}

/** Pinning also moves the item to the top of its list; unpinning leaves it where it is. */
export function togglePin(
  layout: DashboardLayout,
  itemId: string,
): DashboardLayout {
  const section = sectionOf(layout, itemId);
  if (section === null) return layout;
  if (isPinned(layout, itemId)) {
    return { ...layout, pinnedIds: without(layout.pinnedIds, itemId) };
  }
  const pinned = { ...layout, pinnedIds: [...layout.pinnedIds, itemId] };
  return moveItem(pinned, itemId, section, 0);
}

export function addGroup(
  layout: DashboardLayout,
  id: string,
  name: string,
): DashboardLayout {
  const clean = normalizeGroupName(name);
  if (!clean || id === UNGROUPED || layout.groups.length >= MAX_GROUPS)
    return layout;
  if (layout.groups.some((g) => g.id === id || sameName(g.name, clean)))
    return layout;
  return {
    ...layout,
    groups: [...layout.groups, { id, name: clean, itemIds: [] }],
  };
}

export function renameGroup(
  layout: DashboardLayout,
  id: string,
  name: string,
): DashboardLayout {
  const clean = normalizeGroupName(name);
  const group = layout.groups.find((g) => g.id === id);
  if (!group || !clean || group.name === clean) return layout;
  if (layout.groups.some((g) => g.id !== id && sameName(g.name, clean)))
    return layout;
  return {
    ...layout,
    groups: layout.groups.map((g) => (g.id === id ? { ...g, name: clean } : g)),
  };
}

export function moveGroup(
  layout: DashboardLayout,
  id: string,
  delta: -1 | 1,
): DashboardLayout {
  const from = layout.groups.findIndex((g) => g.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= layout.groups.length) return layout;
  const groups = [...layout.groups];
  [groups[from], groups[to]] = [groups[to], groups[from]];
  return { ...layout, groups };
}

/** Deleting a group never deletes or hides its items: they move to ungrouped. */
export function deleteGroup(
  layout: DashboardLayout,
  id: string,
): DashboardLayout {
  const group = layout.groups.find((g) => g.id === id);
  if (!group) return layout;
  return {
    ...layout,
    groups: layout.groups.filter((g) => g.id !== id),
    ungroupedIds: [...layout.ungroupedIds, ...group.itemIds],
  };
}

/**
 * Re-applies a saved layout to the items that exist right now:
 *
 * - items that vanished leave groups, ungrouped and pinned (but a *hidden* id
 *   is kept — if the item comes back it must still be hidden);
 * - an id placed twice keeps its first place;
 * - items the layout has never seen are appended to ungrouped, so something
 *   new is always discoverable and never silently hidden.
 */
export function reconcileLayout(
  layout: DashboardLayout,
  availableIds: readonly string[],
): DashboardLayout {
  const available = new Set(availableIds);
  const hidden = new Set(layout.hiddenIds);
  const placed = new Set<string>();
  const keep = (ids: readonly string[]) =>
    ids.filter((id) => {
      if (!available.has(id) || hidden.has(id) || placed.has(id)) return false;
      placed.add(id);
      return true;
    });

  const groups = layout.groups.map((g) => ({ ...g, itemIds: keep(g.itemIds) }));
  const ungrouped = keep(layout.ungroupedIds);
  const fresh = availableIds.filter((id) => !placed.has(id) && !hidden.has(id));

  return {
    groups,
    ungroupedIds: [...ungrouped, ...new Set(fresh)],
    hiddenIds: [...new Set(layout.hiddenIds)],
    pinnedIds: layout.pinnedIds.filter(
      (id) => available.has(id) && !hidden.has(id),
    ),
  };
}

/**
 * Makes `selected` the set of placed items: anything else leaves its group,
 * ungrouped and pinned; selected items not yet placed are appended to
 * ungrouped. Used by "Manage repositories" (follow / unfollow in bulk).
 */
export function selectItems(
  layout: DashboardLayout,
  selected: readonly string[],
): DashboardLayout {
  const wanted = new Set(selected);
  const placed = new Set(visibleIds(layout));
  const keep = (ids: readonly string[]) => ids.filter((id) => wanted.has(id));
  return {
    groups: layout.groups.map((g) => ({ ...g, itemIds: keep(g.itemIds) })),
    ungroupedIds: [
      ...keep(layout.ungroupedIds),
      ...[...wanted].filter((id) => !placed.has(id)),
    ],
    hiddenIds: layout.hiddenIds.filter((id) => !wanted.has(id)),
    pinnedIds: keep(layout.pinnedIds),
  };
}

export function layoutsEqual(a: DashboardLayout, b: DashboardLayout): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function sameName(a: string, b: string): boolean {
  return a.toLocaleLowerCase() === b.toLocaleLowerCase();
}
