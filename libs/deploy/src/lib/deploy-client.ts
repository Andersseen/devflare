/**
 * Drives a deployment from a picked folder to a live URL.
 *
 * Written against a transport interface rather than `fetch` so the whole
 * sequence — including the parts that only matter when they go wrong — is
 * testable without a network or a server. The page supplies the real transport,
 * which talks same-origin to `/api/v1/cloud/pages/:name/upload/*`.
 *
 * Nothing here touches Angular. Progress arrives through a callback and the
 * page turns it into signals, which keeps this library node-testable and free
 * of a framework it has no need for.
 */

import { hashAssetAtPath } from './asset-hash';
import { planAssets, type AssetPlan, type PickedFile } from './collect-assets';
import { packBuckets } from './bucket';

export type DeployPhase =
  | 'idle'
  | 'reading'
  | 'comparing'
  | 'uploading'
  | 'publishing'
  | 'done'
  | 'error';

/** A picked file the client can actually read. */
export interface DeployFile extends PickedFile {
  /** MIME type; the browser fills this in from the extension. */
  contentType: string;
  /** Contents base64-encoded, with no `data:` prefix. */
  base64(): Promise<string>;
  /** Contents as text — only ever called for `_headers` and `_redirects`. */
  text(): Promise<string>;
}

export interface UploadAsset {
  key: string;
  value: string;
  metadata: { contentType: string };
  base64: true;
}

export interface PublishRequest {
  manifest: Record<string, string>;
  branch?: string;
  commitMessage?: string;
  headers?: string;
  redirects?: string;
  projectId?: string;
}

/** Whatever the publish route answered with; shaped by the server. */
export interface DeploymentResult {
  id: string;
  url: string;
  status: string;
  [key: string]: unknown;
}

export interface DeployTransport {
  checkMissing(project: string, hashes: string[]): Promise<string[]>;
  uploadBucket(project: string, assets: UploadAsset[]): Promise<void>;
  publish(project: string, body: PublishRequest): Promise<DeploymentResult>;
}

export interface DeployProgress {
  phase: DeployPhase;
  /** Distinct assets in the deployment. */
  total: number;
  /** Of those, how many Cloudflare does not already hold. */
  missing: number;
  /** How many have been uploaded so far. */
  uploaded: number;
  message: string;
}

export interface RunDeployOptions {
  project: string;
  files: readonly DeployFile[];
  transport: DeployTransport;
  branch?: string;
  commitMessage?: string;
  /** DevFlare project to attribute the deployment to, if any. */
  projectId?: string;
  onProgress?: (progress: DeployProgress) => void;
  /** Reported alongside the result so the UI can say what was left out. */
  onPlanned?: (plan: AssetPlan<DeployFile>) => void;
}

const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

export async function runDeploy(
  options: RunDeployOptions,
): Promise<DeploymentResult> {
  const { project, files, transport } = options;

  const progress: DeployProgress = {
    phase: 'idle',
    total: 0,
    missing: 0,
    uploaded: 0,
    message: '',
  };

  const report = (phase: DeployPhase, message: string) => {
    progress.phase = phase;
    progress.message = message;
    options.onProgress?.({ ...progress });
  };

  const plan = planAssets(files as readonly DeployFile[]);
  options.onPlanned?.(plan);

  if (plan.assets.length === 0) {
    throw new Error(
      'That folder has no files to deploy. Pick the build output directory, not the project root.',
    );
  }

  // --- Read and hash -------------------------------------------------------
  report('reading', `Reading ${plan.assets.length} files…`);

  const manifest: Record<string, string> = {};
  /**
   * Keyed by hash, so a file duplicated across the tree — a shared icon, an
   * empty file — is read into the payload once and uploaded once, however many
   * manifest paths point at it.
   */
  const byHash = new Map<string, UploadAsset>();

  for (const { deployPath, file } of plan.assets) {
    const base64 = await file.base64();
    const hash = hashAssetAtPath(base64, deployPath);

    manifest[deployPath] = hash;

    if (!byHash.has(hash)) {
      byHash.set(hash, {
        key: hash,
        value: base64,
        metadata: { contentType: file.contentType || DEFAULT_CONTENT_TYPE },
        base64: true,
      });
    }
  }

  progress.total = byHash.size;

  // --- Ask what is actually missing ----------------------------------------
  report('comparing', `Checking which of ${byHash.size} assets are new…`);

  const missingHashes = await transport.checkMissing(project, [
    ...byHash.keys(),
  ]);
  const missing = missingHashes
    .map((hash) => byHash.get(hash))
    .filter((asset): asset is UploadAsset => asset !== undefined);

  progress.missing = missing.length;

  // --- Upload --------------------------------------------------------------
  if (missing.length === 0) {
    report('uploading', 'Every asset is already uploaded.');
  } else {
    report('uploading', `Uploading ${missing.length} new assets…`);

    // Bucket on the decoded size: `value` is base64, which is ~4/3 the bytes
    // the limits are expressed in.
    const buckets = packBuckets(missing, (asset) =>
      Math.ceil((asset.value.length * 3) / 4),
    );

    for (const bucket of buckets) {
      await transport.uploadBucket(project, bucket);
      progress.uploaded += bucket.length;
      report(
        'uploading',
        `Uploaded ${progress.uploaded} of ${missing.length}…`,
      );
    }
  }

  // --- Publish -------------------------------------------------------------
  report('publishing', 'Publishing the deployment…');

  const deployment = await transport.publish(project, {
    manifest,
    branch: options.branch,
    commitMessage: options.commitMessage,
    headers: plan.headers ? await plan.headers.text() : undefined,
    redirects: plan.redirects ? await plan.redirects.text() : undefined,
    projectId: options.projectId,
  });

  report('done', 'Deployment live.');

  return deployment;
}
