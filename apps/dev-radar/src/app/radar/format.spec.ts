import { isStale, shortSha, timeAgo } from './format';

const NOW = Date.parse('2026-10-12T12:00:00Z');
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

describe('timeAgo', () => {
  it('says never for a missing timestamp, not "0 seconds ago"', () => {
    expect(timeAgo(null, NOW)).toBe('never');
  });

  it.each([
    [2, 'just now'],
    [30, '30 seconds ago'],
    [60, '1 minute ago'],
    [7200, '2 hours ago'],
    [86400 * 3, '3 days ago'],
    [86400 * 65, '2 months ago'],
    [86400 * 800, '2 years ago'],
  ])('%is -> %s', (seconds, expected) => {
    expect(timeAgo(ago(seconds), NOW)).toBe(expected);
  });

  it('survives garbage', () => {
    expect(timeAgo('not a date', NOW)).toBe('unknown');
  });
});

describe('helpers', () => {
  it('shortens shas', () => {
    expect(shortSha('0123456789abcdef')).toBe('0123456');
    expect(shortSha(null)).toBe('');
  });

  it('treats never-synced data as stale', () => {
    expect(isStale(null, NOW)).toBe(true);
    expect(isStale(ago(3600), NOW)).toBe(false);
    expect(isStale(ago(3600 * 25), NOW)).toBe(true);
  });
});
