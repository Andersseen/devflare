import { describe, expect, it } from 'vitest';
import {
  UNGROUPED,
  addGroup,
  defaultLayout,
  deleteGroup,
  hideItem,
  moveGroup,
  moveItem,
  nudgeItem,
  reconcileLayout,
  renameGroup,
  sectionOf,
  selectItems,
  showItem,
  togglePin,
  visibleIds,
  type DashboardLayout,
} from './layout';
import { parseLayout } from './layout-parse';
import { dropIndexFromPoint } from './drop-index';
import { LayoutEditor } from './layout-editor';

const base = (): DashboardLayout =>
  addGroup(
    addGroup(defaultLayout(['a', 'b', 'c', 'd']), 'g1', 'Apps'),
    'g2',
    'Libs',
  );

describe('moveItem', () => {
  it('moves between groups and keeps every item exactly once', () => {
    const next = moveItem(moveItem(base(), 'b', 'g1'), 'c', 'g2');
    expect(next.groups[0].itemIds).toEqual(['b']);
    expect(next.groups[1].itemIds).toEqual(['c']);
    expect(next.ungroupedIds).toEqual(['a', 'd']);
    expect(visibleIds(next).sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('inserts at an index measured before the move (moving down in place)', () => {
    // drop "a" after "c" (index 3 of the displayed list a,b,c,d)
    expect(moveItem(base(), 'a', UNGROUPED, 3).ungroupedIds).toEqual([
      'b',
      'c',
      'a',
      'd',
    ]);
    expect(moveItem(base(), 'd', UNGROUPED, 0).ungroupedIds).toEqual([
      'd',
      'a',
      'b',
      'c',
    ]);
  });

  it('is a no-op (same reference) when the drop changes nothing or is invalid', () => {
    const layout = base();
    expect(moveItem(layout, 'b', UNGROUPED, 1)).toBe(layout);
    expect(moveItem(layout, 'b', UNGROUPED, 2)).toBe(layout);
    expect(moveItem(layout, 'zzz', 'g1')).toBe(layout);
    expect(moveItem(layout, 'a', 'missing')).toBe(layout);
  });

  it('cannot move a hidden item', () => {
    const hidden = hideItem(base(), 'a');
    expect(moveItem(hidden, 'a', 'g1')).toBe(hidden);
  });
});

describe('nudgeItem', () => {
  it('swaps with a neighbour and stops at the edges', () => {
    const layout = base();
    expect(nudgeItem(layout, 'b', -1).ungroupedIds).toEqual([
      'b',
      'a',
      'c',
      'd',
    ]);
    expect(nudgeItem(layout, 'a', -1)).toBe(layout);
    expect(nudgeItem(layout, 'd', 1)).toBe(layout);
  });
});

describe('hide / show', () => {
  it('hides without losing the item and restores it at the end', () => {
    const hidden = hideItem(moveItem(base(), 'b', 'g1'), 'b');
    expect(hidden.hiddenIds).toEqual(['b']);
    expect(sectionOf(hidden, 'b')).toBeNull();
    const shown = showItem(hidden, 'b');
    expect(shown.ungroupedIds).toEqual(['a', 'c', 'd', 'b']);
    expect(shown.hiddenIds).toEqual([]);
  });

  it('ignores invalid restores', () => {
    const layout = base();
    expect(showItem(layout, 'a')).toBe(layout);
    expect(showItem(hideItem(layout, 'a'), 'a', 'nope').hiddenIds).toEqual([
      'a',
    ]);
  });
});

describe('groups', () => {
  it('rejects empty, duplicate (case-insensitive) and reserved names', () => {
    const layout = base();
    expect(addGroup(layout, 'g3', '   ')).toBe(layout);
    expect(addGroup(layout, 'g3', 'apps')).toBe(layout);
    expect(addGroup(layout, UNGROUPED, 'Other')).toBe(layout);
    expect(renameGroup(layout, 'g1', 'LIBS')).toBe(layout);
    expect(renameGroup(layout, 'g1', 'Services').groups[0].name).toBe(
      'Services',
    );
  });

  it('reorders groups', () => {
    expect(moveGroup(base(), 'g2', -1).groups.map((g) => g.id)).toEqual([
      'g2',
      'g1',
    ]);
    const layout = base();
    expect(moveGroup(layout, 'g1', -1)).toBe(layout);
  });

  it('deleting a group moves its items to ungrouped, never hides them', () => {
    const next = deleteGroup(moveItem(base(), 'a', 'g1'), 'g1');
    expect(next.groups.map((g) => g.id)).toEqual(['g2']);
    expect(next.ungroupedIds).toEqual(['b', 'c', 'd', 'a']);
  });
});

describe('togglePin', () => {
  it('pins to the top of its list and unpins in place', () => {
    const pinned = togglePin(base(), 'c');
    expect(pinned.pinnedIds).toEqual(['c']);
    expect(pinned.ungroupedIds).toEqual(['c', 'a', 'b', 'd']);
    expect(togglePin(pinned, 'c').pinnedIds).toEqual([]);
  });
});

describe('selectItems', () => {
  it('unfollows what is not selected, keeps groups and order, appends new', () => {
    const layout = togglePin(moveItem(base(), 'b', 'g1'), 'a');
    const next = selectItems(layout, ['a', 'b', 'x']);
    expect(next.groups[0].itemIds).toEqual(['b']);
    expect(next.ungroupedIds).toEqual(['a', 'x']);
    expect(next.pinnedIds).toEqual(['a']);
    expect(visibleIds(selectItems(layout, []))).toEqual([]);
  });
});

describe('reconcileLayout', () => {
  it('drops vanished items, keeps hidden ids, appends new items as visible', () => {
    const saved = hideItem(moveItem(base(), 'b', 'g1'), 'd');
    const next = reconcileLayout(saved, ['a', 'b', 'd', 'e']);
    expect(next.groups[0].itemIds).toEqual(['b']);
    expect(next.ungroupedIds).toEqual(['a', 'e']);
    expect(next.hiddenIds).toEqual(['d']);
    // "c" vanished from the data; "d" stays hidden even though not in ungrouped.
    expect(visibleIds(next)).not.toContain('c');
  });

  it('keeps a hidden id for an item that is temporarily missing', () => {
    const next = reconcileLayout(hideItem(base(), 'a'), ['b']);
    expect(next.hiddenIds).toEqual(['a']);
    expect(reconcileLayout(next, ['a', 'b']).hiddenIds).toEqual(['a']);
  });

  it('dedupes an id placed twice and is idempotent', () => {
    const broken: DashboardLayout = {
      groups: [{ id: 'g', name: 'G', itemIds: ['a', 'a'] }],
      ungroupedIds: ['a', 'b'],
      hiddenIds: [],
      pinnedIds: ['x'],
    };
    const once = reconcileLayout(broken, ['a', 'b']);
    expect(once.groups[0].itemIds).toEqual(['a']);
    expect(once.ungroupedIds).toEqual(['b']);
    expect(once.pinnedIds).toEqual([]);
    expect(reconcileLayout(once, ['a', 'b'])).toEqual(once);
  });
});

describe('parseLayout', () => {
  const options = { maxItems: 10, isItemId: (v: string) => /^[a-z]+$/.test(v) };
  const good = {
    groups: [{ id: 'g1', name: ' Apps ', itemIds: ['a'] }],
    ungroupedIds: ['b'],
    hiddenIds: ['c'],
    pinnedIds: ['a'],
  };

  it('accepts and normalizes a valid layout', () => {
    const parsed = parseLayout(good, options);
    expect(parsed.ok && parsed.layout.groups[0].name).toBe('Apps');
  });

  it.each([
    ['not an object', 'x'],
    [
      'bad group id',
      { ...good, groups: [{ id: UNGROUPED, name: 'x', itemIds: [] }] },
    ],
    ['duplicate item', { ...good, ungroupedIds: ['a'] }],
    ['visible and hidden', { ...good, hiddenIds: ['b'] }],
    ['pinned but hidden', { ...good, pinnedIds: ['c'] }],
    ['invalid item id', { ...good, ungroupedIds: ['B!'] }],
    [
      'empty name',
      { ...good, groups: [{ id: 'g1', name: '  ', itemIds: [] }] },
    ],
    ['too many items', { ...good, ungroupedIds: 'abcdefghijkl'.split('') }],
  ])('rejects %s', (_label, input) => {
    expect(parseLayout(input, options).ok).toBe(false);
  });
});

describe('dropIndexFromPoint', () => {
  const grid = [
    { left: 0, top: 0, width: 100, height: 50 },
    { left: 110, top: 0, width: 100, height: 50 },
    { left: 0, top: 60, width: 100, height: 50 },
  ];
  it('is grid aware', () => {
    expect(dropIndexFromPoint(grid, 10, 10)).toBe(0);
    expect(dropIndexFromPoint(grid, 190, 10)).toBe(2);
    expect(dropIndexFromPoint(grid, 90, 100)).toBe(3);
    expect(dropIndexFromPoint([], 5, 5)).toBe(0);
  });
  it('uses the vertical axis in a single column', () => {
    const column = [
      { left: 0, top: 0, width: 100, height: 40 },
      { left: 0, top: 50, width: 100, height: 40 },
    ];
    expect(dropIndexFromPoint(column, 50, 10)).toBe(0);
    expect(dropIndexFromPoint(column, 50, 60)).toBe(1);
    expect(dropIndexFromPoint(column, 50, 85)).toBe(2);
  });
});

describe('LayoutEditor', () => {
  const make = (save = async () => undefined) => {
    const saves: DashboardLayout[] = [];
    const editor = new LayoutEditor({
      save: async (l) => {
        saves.push(l);
        await save();
      },
      reset: async () => defaultLayout(['a']),
    });
    editor.setAvailable(['a', 'b']);
    editor.setSource(defaultLayout(['a', 'b']));
    return { editor, saves };
  };

  it('edits a draft, tracks dirty, and cancel restores the saved layout', () => {
    const { editor } = make();
    editor.start();
    expect(editor.dirty()).toBe(false);
    editor.apply((l) => hideItem(l, 'a'));
    expect(editor.dirty()).toBe(true);
    expect(editor.layout().hiddenIds).toEqual(['a']);
    editor.cancel();
    expect(editor.editing()).toBe(false);
    expect(editor.layout().hiddenIds).toEqual([]);
  });

  it('save persists the draft and leaves edit mode; failure keeps editing', async () => {
    const { editor, saves } = make();
    editor.start();
    editor.apply((l) => hideItem(l, 'a'));
    expect(await editor.save()).toBe(true);
    expect(saves).toHaveLength(1);
    expect(editor.editing()).toBe(false);
    expect(editor.saved().hiddenIds).toEqual(['a']);

    const failing = make(async () => {
      throw new Error('nope');
    });
    failing.editor.start();
    failing.editor.apply((l) => hideItem(l, 'a'));
    expect(await failing.editor.save()).toBe(false);
    expect(failing.editor.editing()).toBe(true);
    expect(failing.editor.error()).toBe('nope');
  });

  it('ignores a second save while one is in flight', async () => {
    let release!: () => void;
    const { editor, saves } = make(
      () => new Promise<undefined>((r) => (release = () => r(undefined))),
    );
    editor.start();
    editor.apply((l) => hideItem(l, 'a'));
    const first = editor.save();
    expect(await editor.save()).toBe(false);
    release();
    await first;
    expect(saves).toHaveLength(1);
  });

  it('adopts the layout the server answers with', async () => {
    const editor = new LayoutEditor({
      save: async () => defaultLayout(['b']),
      reset: async () => defaultLayout([]),
    });
    editor.setAvailable(['a', 'b']);
    editor.setSource(defaultLayout(['a', 'b']));
    editor.start();
    await editor.save();
    expect(editor.saved().ungroupedIds).toEqual(['b', 'a']);
  });

  it('reset adopts the server default', async () => {
    const { editor } = make();
    editor.start();
    expect(await editor.reset()).toBe(true);
    expect(editor.editing()).toBe(false);
    expect(editor.layout().ungroupedIds).toEqual(['a', 'b']);
  });
});
