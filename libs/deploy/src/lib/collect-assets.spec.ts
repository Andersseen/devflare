import { describe, expect, it } from 'vitest';
import {
  AssetPlanError,
  planAssets,
  stripCommonRoot,
  type PickedFile,
} from './collect-assets';
import { MAX_ASSET_SIZE } from './asset-hash';

const file = (path: string, size = 10): PickedFile => ({ path, size });

const pathsOf = (plan: ReturnType<typeof planAssets>) =>
  plan.assets.map((asset) => asset.deployPath);

describe('stripCommonRoot', () => {
  it('drops the picked directory name', () => {
    expect(
      stripCommonRoot(['browser/index.html', 'browser/assets/logo.svg']),
    ).toEqual(['index.html', 'assets/logo.svg']);
  });

  it('leaves paths alone when they do not share one root', () => {
    // Already-relative input must survive untouched, or a real directory would
    // be eaten.
    const paths = ['index.html', 'assets/logo.svg'];
    expect(stripCommonRoot(paths)).toEqual(paths);
  });

  it('does not strip when a file sits at the top level alongside the root', () => {
    // `index.html` has nothing to strip, so nothing may be stripped at all.
    expect(stripCommonRoot(['index.html', 'browser/main.js'])).toEqual([
      'index.html',
      'browser/main.js',
    ]);
  });

  it('strips only one level, however deep the tree', () => {
    expect(stripCommonRoot(['dist/a/b/c.js', 'dist/a/b/d.js'])).toEqual([
      'a/b/c.js',
      'a/b/d.js',
    ]);
  });

  it('handles an empty list', () => {
    expect(stripCommonRoot([])).toEqual([]);
  });
});

describe('planAssets', () => {
  it('prefixes every manifest path with a slash', () => {
    const plan = planAssets([
      file('dist/index.html'),
      file('dist/assets/app.js'),
    ]);
    expect(pathsOf(plan)).toEqual(['/index.html', '/assets/app.js']);
  });

  it('pulls _headers and _redirects aside instead of uploading them', () => {
    const plan = planAssets([
      file('dist/index.html'),
      file('dist/_headers'),
      file('dist/_redirects'),
    ]);

    expect(pathsOf(plan)).toEqual(['/index.html']);
    expect(plan.headers?.path).toBe('dist/_headers');
    expect(plan.redirects?.path).toBe('dist/_redirects');
  });

  it('keeps a nested file that merely shares the name', () => {
    // Only the root ones are special to Cloudflare.
    const plan = planAssets([
      file('dist/index.html'),
      file('dist/docs/_headers'),
    ]);
    expect(pathsOf(plan)).toContain('/docs/_headers');
    expect(plan.headers).toBeNull();
  });

  it.each([
    ['dist/_worker.js'],
    ['dist/_worker.js/index.js'],
    ['dist/_routes.json'],
    ['dist/functions/api/hello.ts'],
  ])('reports %s as a Functions file rather than deploying it', (path) => {
    const plan = planAssets([file('dist/index.html'), file(path)]);

    expect(pathsOf(plan)).toEqual(['/index.html']);
    expect(plan.skipped).toContainEqual({
      path: path.slice('dist/'.length),
      reason: 'functions',
    });
  });

  it.each([
    ['dist/.DS_Store'],
    ['dist/assets/.DS_Store'],
    ['dist/node_modules/left/over.js'],
    ['dist/.git/HEAD'],
    ['dist/.wrangler/state/x.json'],
  ])('drops %s as noise', (path) => {
    const plan = planAssets([file('dist/index.html'), file(path)]);

    expect(pathsOf(plan)).toEqual(['/index.html']);
    expect(plan.skipped[0]).toMatchObject({ reason: 'noise' });
  });

  it('sums the bytes it will actually upload', () => {
    const plan = planAssets([
      file('dist/a.js', 100),
      file('dist/b.js', 250),
      file('dist/.DS_Store', 6148),
    ]);
    expect(plan.totalBytes).toBe(350);
  });

  it('rejects a file over the Pages size limit, naming it', () => {
    expect(() =>
      planAssets([file('dist/huge.mp4', MAX_ASSET_SIZE + 1)]),
    ).toThrow(AssetPlanError);
    expect(() =>
      planAssets([file('dist/huge.mp4', MAX_ASSET_SIZE + 1)]),
    ).toThrow(/huge\.mp4/);
  });

  it('accepts a file exactly at the limit', () => {
    const plan = planAssets([file('dist/big.mp4', MAX_ASSET_SIZE)]);
    expect(pathsOf(plan)).toEqual(['/big.mp4']);
  });

  it('rejects more than 20,000 assets', () => {
    const many = Array.from({ length: 20_001 }, (_, i) =>
      file(`dist/f${i}.txt`),
    );
    expect(() => planAssets(many)).toThrow(/20,000/);
  });

  it('does not count skipped files towards the limit', () => {
    const many = Array.from({ length: 20_000 }, (_, i) =>
      file(`dist/f${i}.txt`),
    );
    expect(() =>
      planAssets([...many, file('dist/.DS_Store'), file('dist/_worker.js')]),
    ).not.toThrow();
  });

  it('handles an empty folder', () => {
    const plan = planAssets([]);
    expect(plan).toMatchObject({
      assets: [],
      headers: null,
      redirects: null,
      skipped: [],
      totalBytes: 0,
    });
  });
});
