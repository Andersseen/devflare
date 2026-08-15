/**
 * Turns whatever the browser's directory picker handed over into the exact set
 * of assets a Pages deployment is made of.
 *
 * Pure and DOM-free on purpose: it works on `{ path, size }` records, so the
 * rules below are testable without a `File`, a `FileReader` or a DOM. Reading
 * the bytes is the caller's job.
 *
 * The ignore list is wrangler's, copied from `src/pages/validate.ts` rather
 * than invented here — an asset set that disagrees with wrangler's would make
 * DevFlare and `wrangler pages deploy` produce different deployments from the
 * same folder, which is exactly the kind of divergence nobody would notice
 * until it mattered.
 */

import { MAX_ASSET_COUNT, MAX_ASSET_SIZE } from './asset-hash';

/** The minimum a caller must tell us about a picked file. */
export interface PickedFile {
  /**
   * Path as the picker reports it, including the chosen directory's own name —
   * `<input webkitdirectory>` sets `webkitRelativePath` to exactly this, e.g.
   * `browser/assets/logo.svg`. Always forward slashes.
   */
  path: string;
  size: number;
}

export type SkipReason =
  /** Build noise and VCS metadata. Never belonged in a deployment. */
  | 'noise'
  /** Pages Functions — deliberately out of scope, and worth telling the user. */
  | 'functions';

export interface SkippedFile {
  path: string;
  reason: SkipReason;
}

export interface AssetPlan<T extends PickedFile> {
  /** Manifest path (with the leading slash Cloudflare expects) → the file. */
  assets: { deployPath: string; file: T }[];
  /**
   * `_headers` and `_redirects` are not manifest assets. Cloudflare takes them
   * as their own multipart fields on the deployment request, so they are pulled
   * aside here rather than uploaded — a redirects file that shipped as an asset
   * would be served as a text file and silently do nothing, which for an
   * Angular SPA means every deep link 404s.
   */
  headers: T | null;
  redirects: T | null;
  /** Surfaced rather than swallowed, so the UI can say what was left out. */
  skipped: SkippedFile[];
  totalBytes: number;
}

/** Thrown for the two things Cloudflare will refuse outright. */
export class AssetPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssetPlanError';
  }
}

/** Ignored only at the root of the deployment. */
const ROOT_FUNCTIONS = new Set(['_worker.js', '_routes.json', 'functions']);
const ROOT_NOISE = new Set(['.wrangler']);

/** Ignored wherever they appear in the path. */
const SEGMENT_NOISE = new Set(['node_modules', '.git']);
const NAME_NOISE = new Set(['.DS_Store']);

/**
 * Drops the picked directory's own name from every path, so a folder chosen as
 * `browser/` deploys `browser/index.html` at `/index.html`.
 *
 * Only strips when every path genuinely shares one leading segment. Stripping
 * per-path unconditionally would quietly eat a real directory the moment a
 * caller passed paths that were already relative.
 */
export function stripCommonRoot(paths: readonly string[]): string[] {
  if (paths.length === 0) return [];

  const first = paths[0].split('/')[0];
  const shared = paths.every((path) => {
    const segments = path.split('/');
    // A file sitting at the root has nothing to strip — `first` would be its
    // own name, and removing it would leave an empty path.
    return segments.length > 1 && segments[0] === first;
  });

  return shared
    ? paths.map((path) => path.slice(first.length + 1))
    : [...paths];
}

function classify(relativePath: string): SkipReason | null {
  const segments = relativePath.split('/');
  const [root] = segments;
  const name = segments[segments.length - 1];

  if (ROOT_FUNCTIONS.has(root)) return 'functions';
  if (ROOT_NOISE.has(root)) return 'noise';
  if (NAME_NOISE.has(name)) return 'noise';
  if (segments.some((segment) => SEGMENT_NOISE.has(segment))) return 'noise';

  return null;
}

export function planAssets<T extends PickedFile>(
  files: readonly T[],
): AssetPlan<T> {
  const relative = stripCommonRoot(files.map((file) => file.path));

  const assets: AssetPlan<T>['assets'] = [];
  const skipped: SkippedFile[] = [];
  let headers: T | null = null;
  let redirects: T | null = null;
  let totalBytes = 0;

  files.forEach((file, index) => {
    const path = relative[index];
    if (!path) return;

    const skipReason = classify(path);
    if (skipReason) {
      skipped.push({ path, reason: skipReason });
      return;
    }

    if (file.size > MAX_ASSET_SIZE) {
      throw new AssetPlanError(
        `Cloudflare Pages refuses any file over ${MAX_ASSET_SIZE / 1024 / 1024} MiB. ` +
          `"${path}" is ${(file.size / 1024 / 1024).toFixed(1)} MiB.`,
      );
    }

    if (path === '_headers') {
      headers = file;
      return;
    }
    if (path === '_redirects') {
      redirects = file;
      return;
    }

    totalBytes += file.size;
    assets.push({ deployPath: `/${path}`, file });
  });

  if (assets.length > MAX_ASSET_COUNT) {
    throw new AssetPlanError(
      `Cloudflare Pages allows ${MAX_ASSET_COUNT.toLocaleString()} files per deployment; ` +
        `this folder has ${assets.length.toLocaleString()}.`,
    );
  }

  return { assets, headers, redirects, skipped, totalBytes };
}
