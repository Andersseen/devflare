/**
 * Shapes and helpers shared by the project routes.
 *
 * Named `project-rows` rather than `projects` on purpose: a `lib/projects.ts`
 * cannot be imported from `routes/api/v1/projects/*` under the Nitro dev
 * server, which answers every request with `Could not resolve
 * "../../../../lib/projects"`. The production build resolves it fine — only dev
 * breaks — so the collision is silent until the app is actually run.
 *
 * `rowsOf` exists because db0's `sql` tagged template answers a SELECT with
 * `{ rows, success }`, not with an array — session.ts already reads `.rows`,
 * but the project routes were treating the envelope as the array itself, so
 * `.length` was always undefined: the list came back as an object the browser
 * could not iterate, and fetching or deleting one project always 404'd. Reading
 * the envelope in one place is what stops that being rediscovered per route.
 *
 * Pure: no db, no h3. The queries live in ./project-store.ts.
 */

export interface ProjectRow {
  id: string;
  userId: string;
  name: string;
  repoUrl: string | null;
  createdAt: string;
}

/**
 * The resource kinds a project can own (spec 019). Deliberately the five the
 * Cloud section already reads — a type DevFlare cannot list is a type it
 * cannot verify, so it cannot be linked either.
 */
export const PROJECT_RESOURCE_TYPES = [
  'pages',
  'worker',
  'd1',
  'r2',
  'kv',
] as const;

export type ProjectResourceType = (typeof PROJECT_RESOURCE_TYPES)[number];

export type ResourceProvider = 'cloudflare';

/** One row of `project_resource`: which resource belongs to which project. */
export interface ProjectResourceRow {
  id: string;
  projectId: string;
  provider: ResourceProvider;
  type: ProjectResourceType;
  /**
   * The stable Cloudflare identifier: script name, Pages project name, D1
   * uuid, KV namespace id, R2 bucket name.
   */
  resourceId: string;
  /** The label at link time — a D1 name or KV title can change later. */
  resourceName: string;
  createdAt: string;
}

/** What the API returns: a project with the resources it owns. */
export interface ProjectWithResources extends ProjectRow {
  resources: ProjectResourceRow[];
}

interface SqlResult<T> {
  rows?: T[];
}

export function rowsOf<T>(result: unknown): T[] {
  return (result as SqlResult<T>)?.rows ?? [];
}

/**
 * Joins resources onto their projects in memory. Two queries and this, rather
 * than one row per (project, resource) pair that every reader then regroups.
 * Order of each project's resources is the order they arrive in.
 */
export function attachResources(
  projects: readonly ProjectRow[],
  resources: readonly ProjectResourceRow[],
): ProjectWithResources[] {
  const byProject = new Map<string, ProjectResourceRow[]>();
  for (const resource of resources) {
    const list = byProject.get(resource.projectId) ?? [];
    list.push(resource);
    byProject.set(resource.projectId, list);
  }

  return projects.map((project) => ({
    ...project,
    resources: byProject.get(project.id) ?? [],
  }));
}

export function isProjectResourceType(
  value: unknown,
): value is ProjectResourceType {
  return (
    typeof value === 'string' &&
    (PROJECT_RESOURCE_TYPES as readonly string[]).includes(value)
  );
}

const MAX_NAME_LENGTH = 100;
const MAX_URL_LENGTH = 2048;
const MAX_RESOURCE_ID_LENGTH = 255;

export function parseProjectName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Name is required');
  }
  const name = value.trim();
  if (name.length > MAX_NAME_LENGTH) {
    throw new Error(`Name must be at most ${MAX_NAME_LENGTH} characters`);
  }
  return name;
}

/**
 * A repository URL in one canonical spelling, or null for "none".
 *
 * Accepts what people actually paste — `owner/repo`, `github.com/owner/repo`,
 * an SSH remote, a URL with `.git` or a trailing slash — and stores a plain
 * `https://host/path`. Anything that is not an http(s) URL is refused rather
 * than stored: it used to be saved verbatim and then rendered as a broken link.
 */
export function normalizeRepoUrl(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new Error('Repository URL must be a string');
  }

  let input = value.trim();
  if (!input) return null;
  if (input.length > MAX_URL_LENGTH) {
    throw new Error('Repository URL is too long');
  }

  // git@github.com:owner/repo.git
  const ssh = /^git@([^:/\s]+):(.+)$/.exec(input);
  if (ssh) input = `https://${ssh[1]}/${ssh[2]}`;
  // owner/repo — GitHub is the only host a bare pair can mean here.
  else if (/^[\w.-]+\/[\w.-]+$/.test(input))
    input = `https://github.com/${input}`;
  // github.com/owner/repo
  else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) input = `https://${input}`;

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('Repository URL must be a valid http(s) URL');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Repository URL must be a valid http(s) URL');
  }
  if (!url.hostname.includes('.') || url.username || url.password) {
    throw new Error('Repository URL must be a valid http(s) URL');
  }

  const path = url.pathname.replace(/\/+$/, '').replace(/\.git$/i, '');
  return `${url.protocol}//${url.host.toLowerCase()}${path}`;
}

/**
 * Body of `POST /api/v1/projects` and `PATCH /api/v1/projects/:id`. On a patch
 * a field that is absent is left alone; on create the name is required.
 */
export function parseProjectInput(
  body: unknown,
  mode: 'create' | 'update',
): { name?: string; repoUrl?: string | null } {
  const input = (body ?? {}) as { name?: unknown; repoUrl?: unknown };
  const result: { name?: string; repoUrl?: string | null } = {};

  if (mode === 'create' || input.name !== undefined) {
    result.name = parseProjectName(input.name);
  }
  if (mode === 'create' || input.repoUrl !== undefined) {
    result.repoUrl = normalizeRepoUrl(input.repoUrl);
  }
  if (mode === 'update' && !Object.keys(result).length) {
    throw new Error('Nothing to update: send name and/or repoUrl');
  }

  return result;
}

export interface ResourceLinkInput {
  provider: ResourceProvider;
  type: ProjectResourceType;
  resourceId: string;
}

/**
 * Body of `POST /api/v1/projects/:id/resources`. Only the identity is taken
 * from the browser — the display name is whatever Cloudflare reports when the
 * link is verified, so a client cannot label a resource as something else.
 */
export function parseResourceLink(body: unknown): ResourceLinkInput {
  const input = (body ?? {}) as {
    provider?: unknown;
    type?: unknown;
    resourceId?: unknown;
  };

  if (input.provider !== undefined && input.provider !== 'cloudflare') {
    throw new Error('provider must be "cloudflare"');
  }

  if (!isProjectResourceType(input.type)) {
    throw new Error(`type must be one of ${PROJECT_RESOURCE_TYPES.join(', ')}`);
  }

  if (typeof input.resourceId !== 'string' || !input.resourceId.trim()) {
    throw new Error('resourceId is required');
  }

  const resourceId = input.resourceId.trim();
  if (resourceId.length > MAX_RESOURCE_ID_LENGTH) {
    throw new Error('resourceId is too long');
  }

  return { provider: 'cloudflare', type: input.type, resourceId };
}
