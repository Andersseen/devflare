/**
 * The four calls a Cloudflare Pages direct upload is made of.
 *
 * Kept apart from ./cloudflare.ts because two of them do not fit the shape that
 * module assumes. `/pages/assets/check-missing` and `/pages/assets/upload` are
 * **not** account-scoped — they carry no `/accounts/{id}` prefix and
 * authenticate with a short-lived per-project JWT rather than the account
 * token — and creating a deployment is `multipart/form-data` rather than JSON.
 * Both go through `cfRequest`, so the error semantics stay identical: a refusal
 * upstream arrives with its own status instead of becoming a 500.
 *
 * The account token still never leaves this server. The upload JWT never leaves
 * it either: handing that to the browser would be defensible, since it is
 * scoped to one project's assets and wrangler itself accepts one through
 * `CF_PAGES_UPLOAD_JWT`, but it would mean the browser calling
 * api.cloudflare.com directly, and whether that origin serves CORS for
 * /pages/assets/* is not something this repo has verified.
 *
 * `h3` is deliberately not imported here, matching ./cloudflare.ts and
 * ./devauth-admin.ts — plain, unit-testable code with no framework dependency.
 */

import {
  API_BASE,
  cfRequest,
  CloudflareApiError,
  type CloudflareConfig,
  type PagesDeployment,
} from './cloudflare';

/**
 * A bucket of ~20 MB of base64 needs more than the 10s a listing gets, but a
 * hung upload still must not hold a Worker invocation open indefinitely.
 */
const UPLOAD_TIMEOUT_MS = 60_000;

/** Refreshed this long before the JWT's own `exp`, to survive a slow upload. */
const TOKEN_SAFETY_MARGIN_MS = 60_000;

/** Used only when a token's `exp` cannot be read. Deliberately short. */
const TOKEN_FALLBACK_TTL_MS = 5 * 60_000;

/** One asset as `/pages/assets/upload` wants it. */
export interface UploadAsset {
  /** The content hash — see `@org/deploy`'s asset-hash.ts. */
  key: string;
  /** The file's bytes, base64-encoded. */
  value: string;
  metadata: { contentType: string };
  base64: true;
}

export interface CreateDeploymentOptions {
  /** Manifest path (`/index.html`) → content hash. */
  manifest: Record<string, string>;
  branch?: string;
  commitMessage?: string;
  /** Contents, not paths — these travel as their own multipart parts. */
  headers?: string;
  redirects?: string;
}

const uploadTokens = new Map<string, { jwt: string; expiresAt: number }>();

/** Exported for tests, and used after a deployment so nothing goes stale. */
export function clearUploadTokenCache(): void {
  uploadTokens.clear();
}

/**
 * Reads `exp` out of a JWT without verifying it — this server is the token's
 * recipient, not its validator; it only needs to know when to ask for another.
 * An unreadable token is not an error here: it falls back to a short TTL and
 * lets the API be the judge of whether it is still good.
 */
export function jwtExpiryMs(jwt: string): number | null {
  const payload = jwt.split('.')[1];
  if (!payload) return null;

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const claims = JSON.parse(atob(padded)) as { exp?: number };
    return typeof claims.exp === 'number' ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * The credential for `/pages/assets/*`, memoised per project so a deployment of
 * many buckets costs one round trip rather than one per bucket.
 */
export async function getUploadToken(
  config: CloudflareConfig,
  project: string,
): Promise<string> {
  const cacheKey = `${config.accountId}:${project}`;
  const cached = uploadTokens.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.jwt;

  const { jwt } = await cfRequest<{ jwt: string }>(
    `${API_BASE}/accounts/${config.accountId}/pages/projects/${encodeURIComponent(project)}/upload-token`,
    { headers: { Authorization: `Bearer ${config.token}` } },
  );

  if (!jwt) {
    throw new CloudflareApiError(
      'Cloudflare returned no upload token for this Pages project',
      502,
    );
  }

  const exp = jwtExpiryMs(jwt);
  uploadTokens.set(cacheKey, {
    jwt,
    expiresAt: exp
      ? exp - TOKEN_SAFETY_MARGIN_MS
      : Date.now() + TOKEN_FALLBACK_TTL_MS,
  });

  return jwt;
}

/**
 * Which of these hashes Cloudflare does not already hold. This is the whole
 * reason a re-deploy of an unchanged site costs almost nothing — and the reason
 * the asset hash has to match wrangler's exactly, because a wrong hash makes
 * this answer "all of them", forever, without ever failing.
 */
export async function checkMissingHashes(
  jwt: string,
  hashes: string[],
): Promise<string[]> {
  if (hashes.length === 0) return [];

  return cfRequest<string[]>(`${API_BASE}/pages/assets/check-missing`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ hashes }),
  });
}

/** Uploads one bucket. The caller does the bucketing; see `@org/deploy`. */
export async function uploadAssetBucket(
  jwt: string,
  assets: UploadAsset[],
): Promise<void> {
  if (assets.length === 0) return;

  await cfRequest<unknown>(`${API_BASE}/pages/assets/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify(assets),
    timeoutMs: UPLOAD_TIMEOUT_MS,
  });
}

/**
 * Publishes the manifest as a new deployment.
 *
 * Note the endpoint: it is the same one `routes/api/v1/cloud/pages/[name]/
 * deploy.post.ts` posts to with no body at all to make a git-connected project
 * rebuild. With a manifest attached it is a direct upload instead — which is
 * why every Pages project on this account, all of them direct uploads, now has
 * a path through DevFlare that the bodiless rebuild could never give them.
 *
 * `Content-Type` is deliberately unset: `fetch` derives it from the FormData,
 * including the multipart boundary, and setting it by hand breaks the parse.
 */
export async function createPagesDeployment(
  config: CloudflareConfig,
  project: string,
  options: CreateDeploymentOptions,
): Promise<PagesDeployment> {
  const form = new FormData();
  form.append('manifest', JSON.stringify(options.manifest));

  if (options.branch) form.append('branch', options.branch);
  if (options.commitMessage)
    form.append('commit_message', options.commitMessage);
  if (options.headers !== undefined)
    form.append('_headers', new Blob([options.headers]), '_headers');
  if (options.redirects !== undefined)
    form.append('_redirects', new Blob([options.redirects]), '_redirects');

  const deployment = await cfRequest<PagesDeployment>(
    `${API_BASE}/accounts/${config.accountId}/pages/projects/${encodeURIComponent(project)}/deployments`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}` },
      body: form,
      timeoutMs: UPLOAD_TIMEOUT_MS,
    },
  );

  return deployment;
}
