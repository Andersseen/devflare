import { describe, it, expect } from 'vitest';
import {
  attachResources,
  normalizeRepoUrl,
  parseProjectInput,
  parseResourceLink,
  rowsOf,
  type ProjectResourceRow,
} from './project-rows';

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

describe('normalizeRepoUrl', () => {
  it('stores one canonical spelling of what people paste', () => {
    const canonical = 'https://github.com/andersseen/ally';
    for (const input of [
      'andersseen/ally',
      'github.com/andersseen/ally',
      'https://github.com/andersseen/ally',
      'https://github.com/andersseen/ally/',
      'https://github.com/andersseen/ally.git',
      'https://GitHub.com/andersseen/ally',
      'git@github.com:andersseen/ally.git',
      '  https://github.com/andersseen/ally  ',
    ]) {
      expect(normalizeRepoUrl(input)).toBe(canonical);
    }
  });

  it('keeps other hosts', () => {
    expect(normalizeRepoUrl('https://gitlab.com/group/sub/repo')).toBe(
      'https://gitlab.com/group/sub/repo',
    );
  });

  it('treats blank as "no repository"', () => {
    expect(normalizeRepoUrl('')).toBeNull();
    expect(normalizeRepoUrl('   ')).toBeNull();
    expect(normalizeRepoUrl(null)).toBeNull();
    expect(normalizeRepoUrl(undefined)).toBeNull();
  });

  it('refuses what is not an http(s) URL', () => {
    for (const input of [
      'javascript:alert(1)',
      'ftp://example.com/repo',
      'not a url',
      'https://user:pass@github.com/a/b',
      42,
    ]) {
      expect(() => normalizeRepoUrl(input)).toThrow();
    }
  });
});

describe('parseProjectInput', () => {
  it('needs a name to create', () => {
    expect(() => parseProjectInput({}, 'create')).toThrow(/Name/);
    expect(() => parseProjectInput({ name: '  ' }, 'create')).toThrow(/Name/);
    expect(parseProjectInput({ name: ' Ally ' }, 'create')).toEqual({
      name: 'Ally',
      repoUrl: null,
    });
  });

  it('asks nothing about infrastructure', () => {
    // A legacy client sending the old single link gets it ignored, not stored.
    expect(
      parseProjectInput(
        { name: 'Ally', cfType: 'pages', cfName: 'x' },
        'create',
      ),
    ).toEqual({ name: 'Ally', repoUrl: null });
  });

  it('leaves absent fields alone on update, and clears a repository with null', () => {
    expect(parseProjectInput({ repoUrl: null }, 'update')).toEqual({
      repoUrl: null,
    });
    expect(parseProjectInput({ name: 'New' }, 'update')).toEqual({
      name: 'New',
    });
    expect(() => parseProjectInput({}, 'update')).toThrow(/Nothing/);
  });
});

describe('parseResourceLink', () => {
  it('accepts every supported type, defaulting the provider', () => {
    for (const type of ['pages', 'worker', 'd1', 'r2', 'kv']) {
      expect(parseResourceLink({ type, resourceId: ' id ' })).toEqual({
        provider: 'cloudflare',
        type,
        resourceId: 'id',
      });
    }
  });

  it('refuses another provider, an unknown type or no identifier', () => {
    expect(() =>
      parseResourceLink({ provider: 'aws', type: 'worker', resourceId: 'x' }),
    ).toThrow(/provider/);
    expect(() => parseResourceLink({ type: 'queue', resourceId: 'x' })).toThrow(
      /type/,
    );
    expect(() => parseResourceLink({ type: 'worker' })).toThrow(/resourceId/);
    expect(() => parseResourceLink({ type: 'worker', resourceId: '' })).toThrow(
      /resourceId/,
    );
    expect(() => parseResourceLink(null)).toThrow();
  });
});

describe('attachResources', () => {
  it('gives every project its own resources and the rest an empty list', () => {
    const resource = (id: string, projectId: string): ProjectResourceRow => ({
      id,
      projectId,
      provider: 'cloudflare',
      type: 'worker',
      resourceId: id,
      resourceName: id,
      createdAt: 'now',
    });
    const project = (id: string) => ({
      id,
      userId: 'u',
      name: id,
      repoUrl: null,
      createdAt: 'now',
    });

    const result = attachResources(
      [project('a'), project('b')],
      [resource('w1', 'a'), resource('w2', 'a')],
    );
    expect(result.map((p) => p.resources.map((r) => r.id))).toEqual([
      ['w1', 'w2'],
      [],
    ]);
  });
});
