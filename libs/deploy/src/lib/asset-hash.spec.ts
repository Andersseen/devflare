import { describe, expect, it } from 'vitest';
import { extensionOf, hashAsset, hashAssetAtPath } from './asset-hash';

/**
 * Every expected hash below was produced by running `blake3-wasm@2.1.5` — the
 * exact package wrangler bundles — through wrangler's own `hashFile` algorithm,
 * and confirmed identical to what this module computes with
 * `@noble/hashes/blake3`. They are not self-generated: regenerating them from
 * this implementation would defeat the point of the file.
 *
 * If one of these ever fails, do not update the expectation. A changed hash
 * means DevFlare and Cloudflare no longer agree on asset identity, and the only
 * visible symptom would be that every deploy re-uploads the whole site.
 */
describe('hashAsset — vectors cross-checked against wrangler', () => {
  const vectors: [label: string, base64: string, ext: string, hash: string][] =
    [
      [
        'an html document',
        'PCFkb2N0eXBlIGh0bWw+PHRpdGxlPkRldkZsYXJlPC90aXRsZT4=',
        'html',
        'e43f5a4a67f3df22d73b90ef637fee5e',
      ],
      [
        'a stylesheet',
        'Ym9keXttYXJnaW46MH0=',
        'css',
        'c9bef520a538546b7487a8634c45a24e',
      ],
      ['an empty file', '', 'txt', 'f9bc91770fa5e997cbd47fba833629fc'],
      [
        'a script',
        'Y29uc29sZS5sb2coImhpIik=',
        'js',
        'bf412d0332411919cba7d5b4986dda99',
      ],
      ['non-utf8 bytes', 'AAEC/f7/', 'bin', '83e917c893bfbdeb1f5e015e31303f07'],
      [
        'no extension at all',
        'bm8tZXh0ZW5zaW9uLWZpbGU=',
        '',
        'ea113bd8d0d006da0480640135069052',
      ],
    ];

  for (const [label, base64, ext, expected] of vectors) {
    it(`matches wrangler for ${label}`, () => {
      expect(hashAsset(base64, ext)).toBe(expected);
    });
  }

  it('is always 32 hex characters', () => {
    for (const [, base64, ext] of vectors) {
      expect(hashAsset(base64, ext)).toMatch(/^[0-9a-f]{32}$/);
    }
  });

  it('separates identical bytes by extension', () => {
    // The extension is part of the hashed input, so the same content served as
    // .html and as .txt are two different assets to Cloudflare.
    expect(hashAsset('Ym9keXttYXJnaW46MH0=', 'css')).not.toBe(
      hashAsset('Ym9keXttYXJnaW46MH0=', 'txt'),
    );
  });
});

describe('extensionOf', () => {
  it.each([
    ['index.html', 'html'],
    ['assets/main-A1B2C3.js', 'js'],
    ['archive.tar.gz', 'gz'],
    ['LICENSE', ''],
    ['nested/dir/file', ''],
    // Node's path.extname reads a leading dot as the start of the name.
    ['.gitignore', ''],
    ['.well-known/security.txt', 'txt'],
    // A trailing dot yields '.', which wrangler's substring(1) empties.
    ['weird.', ''],
    // Only the last segment counts — a dot in a directory name is not one here.
    ['my.dir/plainfile', ''],
  ])('%s → %o', (input, expected) => {
    expect(extensionOf(input)).toBe(expected);
  });
});

describe('hashAssetAtPath', () => {
  it('derives the extension from the path', () => {
    expect(
      hashAssetAtPath(
        'PCFkb2N0eXBlIGh0bWw+PHRpdGxlPkRldkZsYXJlPC90aXRsZT4=',
        'index.html',
      ),
    ).toBe('e43f5a4a67f3df22d73b90ef637fee5e');
  });

  it('treats a dotfile as having no extension', () => {
    expect(hashAssetAtPath('bm8tZXh0ZW5zaW9uLWZpbGU=', '.gitignore')).toBe(
      hashAsset('bm8tZXh0ZW5zaW9uLWZpbGU=', ''),
    );
  });
});
