import { describe, it, expect } from 'vitest';
import { safeReturnTo } from './return-to';

describe('safeReturnTo', () => {
  it('keeps a same-site path', () => {
    expect(safeReturnTo('/projects')).toBe('/projects');
    expect(safeReturnTo('/projects?tab=all')).toBe('/projects?tab=all');
  });

  it.each([
    ['an absolute URL', 'https://attacker.test/'],
    ['a protocol-relative URL', '//attacker.test/'],
    ['a backslash that browsers read as a slash', '/\\attacker.test/'],
    ['a tab the URL parser drops', '/\t/attacker.test/'],
    ['a newline the URL parser drops', '/\n/attacker.test/'],
    ['a bare path', 'projects'],
    ['a non-string', 42],
    ['nothing', undefined],
  ])('falls back to the root for %s', (_label, value) => {
    expect(safeReturnTo(value)).toBe('/');
  });
});
