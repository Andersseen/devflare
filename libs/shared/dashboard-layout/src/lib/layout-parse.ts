import {
  MAX_GROUPS,
  MAX_GROUP_NAME_LENGTH,
  UNGROUPED,
  type DashboardLayout,
} from './layout';

export interface ParseOptions {
  /** Upper bound on distinct items across the whole layout. */
  maxItems: number;
  /** Product rule for a valid item id (shape only; existence is checked by the caller). */
  isItemId: (value: string) => boolean;
}

export type ParseResult =
  | { ok: true; layout: DashboardLayout }
  | { ok: false; error: string };

const GROUP_ID = /^[A-Za-z0-9_-]{1,64}$/;
const fail = (error: string): ParseResult => ({ ok: false, error });

function ids(
  value: unknown,
  label: string,
  options: ParseOptions,
): string[] | string {
  if (!Array.isArray(value)) return `${label} must be a list`;
  if (value.length > options.maxItems) return `${label} is too long`;
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || !options.isItemId(entry))
      return `${label} has an invalid id`;
    out.push(entry);
  }
  return out;
}

/**
 * Validates an untrusted layout (a request body). Strict: unknown shapes are
 * rejected rather than coerced, an item may appear once in visible places and
 * never both visible and hidden, group ids/names are bounded.
 */
export function parseLayout(
  input: unknown,
  options: ParseOptions,
): ParseResult {
  if (typeof input !== 'object' || input === null)
    return fail('Layout must be an object');
  const body = input as Record<string, unknown>;

  if (!Array.isArray(body['groups'])) return fail('groups must be a list');
  if (body['groups'].length > MAX_GROUPS) return fail('Too many groups');

  const seenGroups = new Set<string>();
  const seenNames = new Set<string>();
  const groups: DashboardLayout['groups'] = [];
  for (const raw of body['groups'] as unknown[]) {
    if (typeof raw !== 'object' || raw === null) return fail('Invalid group');
    const group = raw as Record<string, unknown>;
    const id = group['id'];
    const name = group['name'];
    if (typeof id !== 'string' || !GROUP_ID.test(id) || id === UNGROUPED)
      return fail('Invalid group id');
    if (seenGroups.has(id)) return fail('Duplicate group id');
    if (typeof name !== 'string') return fail('Invalid group name');
    const clean = name.replace(/\s+/g, ' ').trim();
    if (!clean || clean.length > MAX_GROUP_NAME_LENGTH)
      return fail('Invalid group name');
    if (seenNames.has(clean.toLocaleLowerCase()))
      return fail('Duplicate group name');
    const itemIds = ids(group['itemIds'], 'itemIds', options);
    if (typeof itemIds === 'string') return fail(itemIds);
    seenGroups.add(id);
    seenNames.add(clean.toLocaleLowerCase());
    groups.push({ id, name: clean, itemIds });
  }

  const ungroupedIds = ids(body['ungroupedIds'], 'ungroupedIds', options);
  if (typeof ungroupedIds === 'string') return fail(ungroupedIds);
  const hiddenIds = ids(body['hiddenIds'], 'hiddenIds', options);
  if (typeof hiddenIds === 'string') return fail(hiddenIds);
  const pinnedIds = ids(body['pinnedIds'] ?? [], 'pinnedIds', options);
  if (typeof pinnedIds === 'string') return fail(pinnedIds);

  const visible = [...ungroupedIds, ...groups.flatMap((g) => g.itemIds)];
  if (new Set(visible).size !== visible.length)
    return fail('An item is placed more than once');
  if (new Set(hiddenIds).size !== hiddenIds.length)
    return fail('hiddenIds has duplicates');
  if (hiddenIds.some((id) => visible.includes(id)))
    return fail('An item is both visible and hidden');
  if (visible.length + hiddenIds.length > options.maxItems)
    return fail('Too many items');
  const placed = new Set(visible);
  if (
    new Set(pinnedIds).size !== pinnedIds.length ||
    pinnedIds.some((id) => !placed.has(id))
  ) {
    return fail('pinnedIds must be unique visible items');
  }

  return { ok: true, layout: { groups, ungroupedIds, hiddenIds, pinnedIds } };
}
