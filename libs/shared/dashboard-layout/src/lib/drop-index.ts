export interface ItemRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Where a pointer at (x, y) would insert into a list of items laid out in a
 * (possibly wrapping) grid. Returns an index in `0..rects.length`.
 *
 * Quartz's own sortable index looks at one axis only, which is wrong as soon
 * as a row holds more than one card. Here the item nearest the pointer wins,
 * and the pointer's side of its centre (left/right, or top/bottom for a
 * single-column list) decides before/after.
 */
export function dropIndexFromPoint(
  rects: readonly ItemRect[],
  x: number,
  y: number,
): number {
  if (rects.length === 0) return 0;

  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  rects.forEach((rect, i) => {
    const dx = Math.max(rect.left - x, 0, x - (rect.left + rect.width));
    const dy = Math.max(rect.top - y, 0, y - (rect.top + rect.height));
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  });

  const rect = rects[best];
  // Single column (every item shares one left edge): decide on the vertical axis.
  const singleColumn = rects.every((r) => Math.abs(r.left - rect.left) < 2);
  const after = singleColumn
    ? y > rect.top + rect.height / 2
    : x > rect.left + rect.width / 2;
  return after ? best + 1 : best;
}
