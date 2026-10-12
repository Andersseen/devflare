/** Small, pure display helpers. `now` is a parameter so tests need no clock. */

const UNITS: [limit: number, divisor: number, unit: string][] = [
  [60, 1, 'second'],
  [3600, 60, 'minute'],
  [86400, 3600, 'hour'],
  [86400 * 30, 86400, 'day'],
  [86400 * 365, 86400 * 30, 'month'],
];

export function timeAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return 'never';
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return 'unknown';

  const seconds = Math.round((now - time) / 1000);
  if (seconds < 5) return 'just now';
  for (const [limit, divisor, unit] of UNITS) {
    if (Math.abs(seconds) < limit) {
      const value = Math.max(1, Math.floor(seconds / divisor));
      return `${value} ${unit}${value === 1 ? '' : 's'} ago`;
    }
  }
  const years = Math.floor(seconds / (86400 * 365));
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

export const shortSha = (sha: string | null): string =>
  sha ? sha.slice(0, 7) : '';

/** How long since the data was last refreshed, for the staleness hint. */
export function isStale(
  iso: string | null,
  now = Date.now(),
  hours = 24,
): boolean {
  if (!iso) return true;
  return now - Date.parse(iso) > hours * 3600 * 1000;
}
