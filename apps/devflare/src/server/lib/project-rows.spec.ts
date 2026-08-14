import { describe, it, expect } from 'vitest';
import { parseLink, rowsOf } from './project-rows';

describe('rowsOf', () => {
  it('reads the rows out of db0’s envelope', () => {
    // The bug this exists to prevent: treating the envelope as the array, so
    // `.length` is undefined and every lookup 404s.
    expect(rowsOf({ rows: [{ id: 'a' }], success: true })).toEqual([
      { id: 'a' },
    ]);
  });

  it('answers an empty list for a write result or nothing at all', () => {
    expect(rowsOf({ success: true })).toEqual([]);
    expect(rowsOf(null)).toEqual([]);
    expect(rowsOf(undefined)).toEqual([]);
  });
});

describe('parseLink', () => {
  it('accepts a complete link', () => {
    expect(parseLink({ cfType: 'pages', cfName: 'imageryx' })).toEqual({
      cfType: 'pages',
      cfName: 'imageryx',
    });
  });

  it('trims the resource name', () => {
    expect(parseLink({ cfType: 'worker', cfName: '  devflare  ' })).toEqual({
      cfType: 'worker',
      cfName: 'devflare',
    });
  });

  it('treats a missing or empty type as unlinking', () => {
    const cleared = { cfType: null, cfName: null };
    expect(parseLink({})).toEqual(cleared);
    expect(parseLink({ cfType: null })).toEqual(cleared);
    expect(parseLink({ cfType: '' })).toEqual(cleared);
    // The name is dropped with it: half a link is not a state worth storing.
    expect(parseLink({ cfType: null, cfName: 'devflare' })).toEqual(cleared);
  });

  it('refuses a type it does not know', () => {
    expect(() => parseLink({ cfType: 'r2', cfName: 'assets' })).toThrow(
      /worker/,
    );
  });

  it('refuses a type with no name', () => {
    expect(() => parseLink({ cfType: 'pages' })).toThrow(/cfName/);
    expect(() => parseLink({ cfType: 'pages', cfName: '   ' })).toThrow(
      /cfName/,
    );
  });
});
