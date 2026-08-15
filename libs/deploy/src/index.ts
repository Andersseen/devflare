/**
 * `@org/deploy` — the client half of DevFlare's deploy pipeline.
 *
 * Everything here runs in the browser. Reading, base64-encoding and hashing a
 * build output are all CPU work, and a Cloudflare Worker is billed on CPU time
 * rather than wall time, so doing it on the server would burn the request
 * budget on the one thing the browser can do for free. The Worker's job is to
 * hold the API credential and forward bytes; see
 * `apps/devflare/src/server/lib/pages-upload.ts`.
 */

export {
  extensionOf,
  hashAsset,
  hashAssetAtPath,
  MAX_ASSET_COUNT,
  MAX_ASSET_SIZE,
} from './lib/asset-hash';

export {
  AssetPlanError,
  planAssets,
  stripCommonRoot,
  type AssetPlan,
  type PickedFile,
  type SkippedFile,
  type SkipReason,
} from './lib/collect-assets';

export {
  packBuckets,
  DEFAULT_BUCKET_LIMITS,
  MAX_BUCKET_BYTES,
  MAX_BUCKET_FILES,
  type BucketLimits,
} from './lib/bucket';

export {
  runDeploy,
  type DeployFile,
  type DeploymentResult,
  type DeployPhase,
  type DeployProgress,
  type DeployTransport,
  type PublishRequest,
  type RunDeployOptions,
  type UploadAsset,
} from './lib/deploy-client';
