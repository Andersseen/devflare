import { describe, expect, it, vi } from 'vitest';
import {
  runDeploy,
  type DeployFile,
  type DeployTransport,
  type DeployProgress,
  type PublishRequest,
  type UploadAsset,
} from './deploy-client';
import { hashAssetAtPath } from './asset-hash';

/** base64 of `text`, for the ASCII this file uses. */
const b64 = (text: string) => btoa(text);

function file(path: string, content: string, contentType = 'text/plain') {
  return {
    path,
    size: content.length,
    contentType,
    base64: async () => b64(content),
    text: async () => content,
  } satisfies DeployFile;
}

function transport(overrides: Partial<DeployTransport> = {}) {
  const uploaded: UploadAsset[][] = [];
  const published: PublishRequest[] = [];

  const base: DeployTransport = {
    checkMissing: async (_project, hashes) => hashes,
    uploadBucket: async (_project, assets) => {
      uploaded.push(assets);
    },
    publish: async (_project, body) => {
      published.push(body);
      return { id: 'dep-1', url: 'https://x.pages.dev', status: 'success' };
    },
    ...overrides,
  };

  return { transport: base, uploaded, published };
}

describe('runDeploy', () => {
  it('builds a manifest of deployment path → hash', async () => {
    const { transport: t, published } = transport();

    await runDeploy({
      project: 'my-site',
      files: [file('dist/index.html', '<h1>hi</h1>', 'text/html')],
      transport: t,
    });

    expect(published[0].manifest).toEqual({
      '/index.html': hashAssetAtPath(b64('<h1>hi</h1>'), '/index.html'),
    });
  });

  it('uploads only what check-missing reported', async () => {
    const missingOnly = (_p: string, hashes: string[]) =>
      Promise.resolve([hashes[1]]);
    const { transport: t, uploaded } = transport({
      checkMissing: missingOnly,
    });

    await runDeploy({
      project: 'my-site',
      files: [file('dist/a.txt', 'aaa'), file('dist/b.txt', 'bbb')],
      transport: t,
    });

    expect(uploaded.flat()).toHaveLength(1);
    expect(uploaded.flat()[0].value).toBe(b64('bbb'));
  });

  it('uploads nothing at all when the site is unchanged', async () => {
    // The whole point of the hash matching wrangler's: a re-deploy of an
    // untouched folder must move no bytes.
    const {
      transport: t,
      uploaded,
      published,
    } = transport({
      checkMissing: async () => [],
    });

    await runDeploy({
      project: 'my-site',
      files: [file('dist/index.html', '<h1>hi</h1>')],
      transport: t,
    });

    expect(uploaded).toHaveLength(0);
    // But it still publishes: the manifest is what makes the deployment.
    expect(published).toHaveLength(1);
  });

  it('reads and uploads duplicated content once', async () => {
    const { transport: t, uploaded, published } = transport();

    await runDeploy({
      project: 'my-site',
      files: [
        file('dist/a/icon.svg', '<svg/>', 'image/svg+xml'),
        file('dist/b/icon.svg', '<svg/>', 'image/svg+xml'),
      ],
      transport: t,
    });

    // Two manifest entries…
    expect(Object.keys(published[0].manifest)).toEqual([
      '/a/icon.svg',
      '/b/icon.svg',
    ]);
    // …pointing at one hash, uploaded once.
    expect(new Set(Object.values(published[0].manifest)).size).toBe(1);
    expect(uploaded.flat()).toHaveLength(1);
  });

  it('sends _headers and _redirects as text, not as assets', async () => {
    const { transport: t, published } = transport();

    await runDeploy({
      project: 'my-site',
      files: [
        file('dist/index.html', '<h1>hi</h1>'),
        file('dist/_redirects', '/* /index.html 200'),
        file('dist/_headers', '/*\n  X-Frame-Options: DENY'),
      ],
      transport: t,
    });

    expect(published[0].redirects).toBe('/* /index.html 200');
    expect(published[0].headers).toBe('/*\n  X-Frame-Options: DENY');
    expect(Object.keys(published[0].manifest)).toEqual(['/index.html']);
  });

  it('omits them when the folder had none', async () => {
    const { transport: t, published } = transport();

    await runDeploy({
      project: 'my-site',
      files: [file('dist/index.html', 'hi')],
      transport: t,
    });

    expect(published[0].headers).toBeUndefined();
    expect(published[0].redirects).toBeUndefined();
  });

  it('passes branch, commit message and project through', async () => {
    const { transport: t, published } = transport();

    await runDeploy({
      project: 'my-site',
      files: [file('dist/index.html', 'hi')],
      transport: t,
      branch: 'main',
      commitMessage: 'from DevFlare',
      projectId: 'proj-1',
    });

    expect(published[0]).toMatchObject({
      branch: 'main',
      commitMessage: 'from DevFlare',
      projectId: 'proj-1',
    });
  });

  it('advances through the phases in order and ends on done', async () => {
    const phases: DeployProgress['phase'][] = [];
    const { transport: t } = transport();

    await runDeploy({
      project: 'my-site',
      files: [file('dist/index.html', 'hi')],
      transport: t,
      onProgress: (p) => phases.push(p.phase),
    });

    expect(phases).toEqual([
      'reading',
      'comparing',
      'uploading',
      'uploading',
      'publishing',
      'done',
    ]);
  });

  it('counts uploads as buckets complete', async () => {
    const counts: number[] = [];
    const { transport: t } = transport();

    await runDeploy({
      project: 'my-site',
      files: [file('dist/a.txt', 'a'), file('dist/b.txt', 'b')],
      transport: t,
      onProgress: (p) => {
        if (p.phase === 'uploading') counts.push(p.uploaded);
      },
    });

    expect(counts[counts.length - 1]).toBe(2);
  });

  it('reports what it refused to deploy', async () => {
    const onPlanned = vi.fn();
    const { transport: t } = transport();

    await runDeploy({
      project: 'my-site',
      files: [file('dist/index.html', 'hi'), file('dist/_worker.js', 'x')],
      transport: t,
      onPlanned,
    });

    expect(onPlanned.mock.calls[0][0].skipped).toEqual([
      { path: '_worker.js', reason: 'functions' },
    ]);
  });

  it('refuses a folder with nothing deployable in it', async () => {
    const { transport: t, published } = transport();

    await expect(
      runDeploy({
        project: 'my-site',
        files: [file('dist/.DS_Store', 'junk')],
        transport: t,
      }),
    ).rejects.toThrow(/no files to deploy/);

    expect(published).toHaveLength(0);
  });

  it('stops on a failed bucket instead of publishing a partial upload', async () => {
    const { transport: t, published } = transport({
      uploadBucket: async () => {
        throw new Error('network died');
      },
    });

    await expect(
      runDeploy({
        project: 'my-site',
        files: [file('dist/index.html', 'hi')],
        transport: t,
      }),
    ).rejects.toThrow('network died');

    // Publishing a manifest whose assets never arrived would deploy a broken
    // site rather than fail.
    expect(published).toHaveLength(0);
  });

  it('surfaces a check-missing failure without uploading anything', async () => {
    const { transport: t, uploaded } = transport({
      checkMissing: async () => {
        throw new Error('403 Forbidden');
      },
    });

    await expect(
      runDeploy({
        project: 'my-site',
        files: [file('dist/index.html', 'hi')],
        transport: t,
      }),
    ).rejects.toThrow('403 Forbidden');

    expect(uploaded).toHaveLength(0);
  });

  it('falls back to a generic content type when the browser gave none', async () => {
    const { transport: t, uploaded } = transport();

    await runDeploy({
      project: 'my-site',
      files: [file('dist/weird.xyz', 'data', '')],
      transport: t,
    });

    expect(uploaded.flat()[0].metadata.contentType).toBe(
      'application/octet-stream',
    );
  });
});
