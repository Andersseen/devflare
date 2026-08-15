/**
 * DevFlare's read/steer client for the owner's own Cloudflare account.
 *
 * The API token here is account-scoped: it can see every Worker, Pages project,
 * database and bucket the owner runs. So it lives on this server and nowhere
 * else — the browser calls DevFlare same-origin with its own session cookie and
 * this module is the only thing that ever holds the credential. Same shape and
 * same reasoning as ./devauth-admin.ts, which fronts the auth service.
 *
 * `h3` is deliberately not imported: routes pass `event.context`, which keeps
 * this plain, unit-testable code with no framework dependency (matching
 * ./oidc.ts and ./devauth-admin.ts).
 */

export const API_BASE = 'https://api.cloudflare.com/client/v4';

/** How long a GET is served from memory before going back to the API. */
const CACHE_TTL_MS = 60_000;

/** A hung upstream must not hold a Worker invocation open indefinitely. */
const REQUEST_TIMEOUT_MS = 10_000;

/** Raised for anything the caller should surface rather than swallow. */
export class CloudflareApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'CloudflareApiError';
  }
}

export interface RequestContext {
  cloudflare?: { env?: Record<string, string | undefined> };
}

/** Just enough of an h3 event to read configuration from. */
export interface ContextCarrier {
  context: RequestContext;
}

/**
 * On Cloudflare, vars arrive as a per-request binding rather than as
 * `process.env` — the same reason ./oidc.ts reads the binding first.
 */
function env(context: RequestContext, key: string): string | undefined {
  return context.cloudflare?.env?.[key] ?? process.env[key];
}

export interface CloudflareConfig {
  accountId: string;
  token: string;
}

/**
 * True when both halves of the credential are present. The status route answers
 * from this so the UI can show a "connect your account" state instead of an
 * error — an unconfigured account is an ordinary state, not a failure.
 */
export function isCloudflareConfigured(context: RequestContext): boolean {
  return Boolean(
    env(context, 'CLOUDFLARE_ACCOUNT_ID') &&
      env(context, 'CLOUDFLARE_API_TOKEN'),
  );
}

export function resolveCloudflareConfig(
  context: RequestContext,
): CloudflareConfig {
  const accountId = env(context, 'CLOUDFLARE_ACCOUNT_ID') ?? '';
  const token = env(context, 'CLOUDFLARE_API_TOKEN') ?? '';

  if (!accountId || !token) {
    // 503, not 401: the caller is fine, this server is missing configuration.
    throw new CloudflareApiError(
      'CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are not configured on this server',
      503,
    );
  }

  return { accountId, token };
}

/** The envelope every v4 endpoint wraps its payload in. */
interface Envelope<T> {
  success: boolean;
  errors?: { code: number; message: string }[];
  result: T;
  result_info?: { page: number; per_page: number; total_count: number };
}

interface CacheEntry {
  expiresAt: number;
  value: unknown;
}

/**
 * Module-scope memo. Per isolate and deliberately small: the point is that
 * walking between Cloud pages does not re-hit the API for the same listing, not
 * durable caching. Cloudflare stays the source of truth.
 */
const cache = new Map<string, CacheEntry>();

function readCache(key: string): unknown | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function writeCache(key: string, value: unknown): void {
  const now = Date.now();
  for (const [entryKey, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(entryKey);
  }
  cache.set(key, { expiresAt: now + CACHE_TTL_MS, value });
}

/** Dropped wholesale after a write: one deploy invalidates several listings. */
export function clearCloudflareCache(): void {
  cache.clear();
}

export interface CfRequestInit {
  method?: string;
  body?: unknown;
  /** Skip the memo and refill it. Ignored for non-GET, which never reads it. */
  refresh?: boolean;
}

export interface CfRawRequestInit {
  method?: string;
  headers?: Record<string, string>;
  /** Passed to `fetch` untouched — a JSON string, or a `FormData`. */
  body?: BodyInit;
  timeoutMs?: number;
}

/**
 * One call to the v4 API with the envelope unwrapped and the error semantics
 * this server depends on: a refusal upstream arrives as a refusal, with its own
 * status, rather than as a 500 or as a silently empty result.
 *
 * Lower-level than `cfFetch` because two things the Pages direct upload needs
 * cannot be expressed through it — `/pages/assets/*` is not account-scoped and
 * authenticates with a per-project JWT rather than the account token, and
 * creating a deployment is `multipart/form-data`. Sharing this instead of
 * hand-rolling a second fetch is what keeps those paths from growing their own,
 * subtly different, idea of what a failure looks like.
 */
export async function cfRequest<T>(
  url: string,
  init: CfRawRequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method ?? 'GET',
      headers: init.headers,
      body: init.body,
      signal: AbortSignal.timeout(init.timeoutMs ?? REQUEST_TIMEOUT_MS),
    });
  } catch {
    // Never include the URL or headers here — no credential may reach a log.
    throw new CloudflareApiError('Could not reach the Cloudflare API', 504);
  }

  const text = await response.text();
  const payload = text ? safeParse<Envelope<T>>(text) : null;

  if (!payload) {
    // An HTML error page from an edge in front of the API, most likely.
    throw new CloudflareApiError(
      `Cloudflare API responded ${response.status}`,
      response.ok ? 502 : response.status,
    );
  }

  if (!response.ok || !payload.success) {
    const first = payload.errors?.[0];
    throw new CloudflareApiError(
      first
        ? `${first.message} (Cloudflare error ${first.code})`
        : `Cloudflare API responded ${response.status}`,
      response.ok ? 502 : response.status,
    );
  }

  return payload.result;
}

/**
 * Calls one account-scoped endpoint. `path` is appended to `/accounts/{id}` and
 * is always written by this server, never taken from a browser, so a caller
 * cannot steer it at another account.
 */
export async function cfFetch<T>(
  config: CloudflareConfig,
  path: `/${string}`,
  init: CfRequestInit = {},
): Promise<T> {
  const method = init.method ?? 'GET';
  const url = `${API_BASE}/accounts/${config.accountId}${path}`;
  const cacheKey = `${config.accountId}${path}`;

  if (method === 'GET' && !init.refresh) {
    const hit = readCache(cacheKey);
    if (hit !== undefined) return hit as T;
  }

  const result = await cfRequest<T>(url, {
    method,
    headers: {
      Authorization: `Bearer ${config.token}`,
      ...(init.body === undefined
        ? {}
        : { 'Content-Type': 'application/json' }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  if (method === 'GET') writeCache(cacheKey, result);
  else clearCloudflareCache();

  return result;
}

function safeParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Account resources
//
// Only the fields DevFlare actually renders are typed. The API returns a great
// deal more; narrowing here is what keeps the client pages honest about what is
// really available.
// ---------------------------------------------------------------------------

export interface WorkerScript {
  id: string;
  created_on: string;
  modified_on: string;
}

export interface WorkerDomain {
  id: string;
  hostname: string;
  service: string;
  environment: string;
}

export interface WorkerVersion {
  id: string;
  number?: number;
  metadata?: {
    created_on?: string;
    modified_on?: string;
    author_email?: string;
    source?: string;
  };
  annotations?: Record<string, string>;
}

export interface PagesDeploymentStage {
  name: string;
  status: string;
  started_on: string | null;
  ended_on: string | null;
}

export interface PagesDeployment {
  id: string;
  short_id: string;
  url: string;
  environment: string;
  created_on: string;
  latest_stage: PagesDeploymentStage | null;
  deployment_trigger?: {
    type?: string;
    metadata?: {
      branch?: string;
      commit_hash?: string;
      commit_message?: string;
    };
  };
}

export interface PagesProject {
  name: string;
  subdomain: string;
  domains: string[];
  created_on: string;
  production_branch: string;
  source?: { type?: string; config?: { owner?: string; repo_name?: string } };
  latest_deployment: PagesDeployment | null;
}

export interface D1Database {
  uuid: string;
  name: string;
  version?: string;
  created_at?: string;
  file_size?: number;
  num_tables?: number;
}

export interface KvNamespace {
  id: string;
  title: string;
}

export interface R2Bucket {
  name: string;
  creation_date: string;
  location?: string;
}

/**
 * The deployment shape DevFlare's own API speaks, flattened out of the three
 * places Cloudflare spreads it across. Declared here because both the list and
 * the detail route return it, and the UI should not learn two spellings.
 */
export interface DeploymentSummary {
  id: string;
  shortId: string;
  url: string;
  environment: string;
  createdOn: string;
  /**
   * `github:push`, `ad_hoc` (a direct upload, e.g. `wrangler pages deploy` from
   * CI), … Worth surfacing because a direct-upload project carries branch and
   * commit metadata exactly like a git-connected one, so the history alone
   * cannot tell you whether Cloudflare could rebuild it.
   */
  trigger: string | null;
  /** Of the latest stage: `success`, `failure`, `active`, `canceled`, … */
  status: string;
  /** Which stage that status belongs to: `queued`, `build`, `deploy`, … */
  stage: string;
  branch: string | null;
  commit: string | null;
  commitMessage: string | null;
}

export function toDeploymentSummary(
  deployment: PagesDeployment,
): DeploymentSummary {
  const trigger = deployment.deployment_trigger?.metadata;

  return {
    id: deployment.id,
    shortId: deployment.short_id,
    url: deployment.url,
    environment: deployment.environment,
    createdOn: deployment.created_on,
    trigger: deployment.deployment_trigger?.type ?? null,
    status: deployment.latest_stage?.status ?? 'unknown',
    stage: deployment.latest_stage?.name ?? 'unknown',
    branch: trigger?.branch ?? null,
    commit: trigger?.commit_hash ?? null,
    commitMessage: trigger?.commit_message?.split('\n')[0] ?? null,
  };
}

export function listWorkers(
  config: CloudflareConfig,
  refresh?: boolean,
): Promise<WorkerScript[]> {
  return cfFetch<WorkerScript[]>(config, '/workers/scripts', { refresh });
}

export function listWorkerDomains(
  config: CloudflareConfig,
  refresh?: boolean,
): Promise<WorkerDomain[]> {
  return cfFetch<WorkerDomain[]>(config, '/workers/domains', { refresh });
}

export function listWorkerVersions(
  config: CloudflareConfig,
  script: string,
  refresh?: boolean,
): Promise<WorkerVersion[]> {
  return cfFetch<{ items?: WorkerVersion[] }>(
    config,
    `/workers/scripts/${encodeURIComponent(script)}/versions`,
    { refresh },
  ).then((result) => result?.items ?? []);
}

export function listPagesProjects(
  config: CloudflareConfig,
  refresh?: boolean,
): Promise<PagesProject[]> {
  return cfFetch<PagesProject[]>(config, '/pages/projects', { refresh });
}

export function listPagesDeployments(
  config: CloudflareConfig,
  project: string,
  refresh?: boolean,
): Promise<PagesDeployment[]> {
  return cfFetch<PagesDeployment[]>(
    config,
    `/pages/projects/${encodeURIComponent(project)}/deployments?per_page=20`,
    { refresh },
  );
}

export function listD1Databases(
  config: CloudflareConfig,
  refresh?: boolean,
): Promise<D1Database[]> {
  return cfFetch<D1Database[]>(config, '/d1/database?per_page=100', {
    refresh,
  });
}

export function listKvNamespaces(
  config: CloudflareConfig,
  refresh?: boolean,
): Promise<KvNamespace[]> {
  return cfFetch<KvNamespace[]>(config, '/storage/kv/namespaces?per_page=100', {
    refresh,
  });
}

export function listR2Buckets(
  config: CloudflareConfig,
  refresh?: boolean,
): Promise<R2Bucket[]> {
  return cfFetch<{ buckets?: R2Bucket[] }>(config, '/r2/buckets', {
    refresh,
  }).then((result) => result?.buckets ?? []);
}
