/**
 * What the project routes do (spec 019), without h3.
 *
 * Each route is an adapter: read the session and body, call one function here,
 * turn a `ProjectApiError` into a response (./project-http.ts). Keeping the
 * decisions — who may see what, what is valid, when a link may be written —
 * out of the h3 layer is what lets project-service.spec.ts run them against
 * the real migrations, the same way ./oidc.ts and ./devauth-admin.ts are
 * tested.
 */

import { CloudflareApiError, type CloudflareConfig } from './cloudflare';
import {
  parseProjectInput,
  parseResourceLink,
  type ProjectResourceRow,
  type ProjectWithResources,
} from './project-rows';
import {
  createProject,
  deleteProject,
  deleteResource,
  findResourceOwner,
  getOwnedProject,
  insertResource,
  listProjects,
  ResourceConflictError,
  updateProject,
} from './project-store';
import {
  cloudflareInventoryReader,
  RESOURCE_TYPE_LABELS,
  verifyCloudflareResource,
  type InventoryReader,
} from './resource-verification';

export type ProjectApiReason =
  | 'invalid'
  | 'conflict'
  | 'not-found'
  | 'unverifiable';

/** A refusal with the status it deserves and, for links, why. */
export class ProjectApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly reason: ProjectApiReason | null = null,
  ) {
    super(message);
    this.name = 'ProjectApiError';
  }
}

export interface Caller {
  id: string;
  email: string;
}

/**
 * How a link gets checked against Cloudflare. Supplied by the route, because
 * both halves need the request: the admin verdict asks dev-auth about this
 * session, and the credential may be renewed from the request's bindings.
 */
export interface VerificationAccess {
  verdict(email: string): Promise<'admin' | 'not-admin' | 'unavailable'>;
  /** Throws `CloudflareApiError` when no account is usable. */
  credential(): Promise<CloudflareConfig>;
  /** Test seam; defaults to reading the live account. */
  reader?(config: CloudflareConfig): InventoryReader;
}

function signedIn(caller: Caller | null): Caller {
  if (!caller) throw new ProjectApiError(401, 'Unauthorized');
  return caller;
}

function invalid(error: unknown, fallback: string): never {
  throw new ProjectApiError(
    400,
    error instanceof Error ? error.message : fallback,
    'invalid',
  );
}

/** 404, not 403, for someone else's project: its existence is not theirs to learn. */
async function owned(
  caller: Caller,
  projectId: string,
): Promise<ProjectWithResources> {
  const project = await getOwnedProject(caller.id, projectId);
  if (!project) throw new ProjectApiError(404, 'Project not found');
  return project;
}

export async function listProjectsFor(
  caller: Caller | null,
): Promise<ProjectWithResources[]> {
  return listProjects(signedIn(caller).id);
}

/** Name and optional repository — nothing about infrastructure (spec 019). */
export async function createProjectFor(
  caller: Caller | null,
  body: unknown,
): Promise<ProjectWithResources> {
  const user = signedIn(caller);
  let input;
  try {
    input = parseProjectInput(body, 'create');
  } catch (error) {
    invalid(error, 'Invalid project');
  }
  return createProject(user.id, {
    name: input.name ?? '',
    repoUrl: input.repoUrl ?? null,
  });
}

export async function getProjectFor(
  caller: Caller | null,
  projectId: string,
): Promise<ProjectWithResources> {
  return owned(signedIn(caller), projectId);
}

export async function updateProjectFor(
  caller: Caller | null,
  projectId: string,
  body: unknown,
): Promise<ProjectWithResources> {
  const user = signedIn(caller);
  await owned(user, projectId);

  let patch;
  try {
    patch = parseProjectInput(body, 'update');
  } catch (error) {
    invalid(error, 'Invalid project');
  }

  const project = await updateProject(user.id, projectId, patch);
  if (!project) throw new ProjectApiError(404, 'Project not found');
  return project;
}

export async function deleteProjectFor(
  caller: Caller | null,
  projectId: string,
): Promise<void> {
  const user = signedIn(caller);
  await owned(user, projectId);
  await deleteProject(user.id, projectId);
}

export async function listResourcesFor(
  caller: Caller | null,
  projectId: string,
): Promise<ProjectResourceRow[]> {
  return (await owned(signedIn(caller), projectId)).resources;
}

/**
 * Links one resource, once Cloudflare has confirmed it exists.
 *
 *   400 invalid       the body is not a resource identity
 *   409 conflict      a project (this one or another) already owns it
 *   422 not-found     Cloudflare listed that product; it was not there
 *   403 unverifiable  the listing was refused, or the caller cannot read the
 *                     platform's Cloudflare account at all
 *   503 unverifiable  no account connected, or the listing is unavailable
 *
 * An unchecked link is never written — "could not verify" is not "fine".
 */
export async function linkResourceFor(
  caller: Caller | null,
  projectId: string,
  body: unknown,
  access: VerificationAccess,
): Promise<ProjectResourceRow> {
  const user = signedIn(caller);
  await owned(user, projectId);

  let link;
  try {
    link = parseResourceLink(body);
  } catch (error) {
    invalid(error, 'Invalid resource');
  }

  const label = RESOURCE_TYPE_LABELS[link.type];

  const owner = await findResourceOwner(
    link.provider,
    link.type,
    link.resourceId,
  );
  if (owner) {
    if (owner.project.id === projectId) {
      throw new ProjectApiError(
        409,
        `This ${label} is already linked to this project`,
        'conflict',
      );
    }
    // Another project is named only to the person who owns it.
    throw new ProjectApiError(
      409,
      owner.project.userId === user.id
        ? `This ${label} already belongs to ${owner.project.name}. Unlink it there first.`
        : `This ${label} already belongs to another project`,
      'conflict',
    );
  }

  const verdict = await access.verdict(user.email);
  if (verdict === 'unavailable') {
    throw new ProjectApiError(
      503,
      'Identity service is not configured on this server, so the resource cannot be verified',
      'unverifiable',
    );
  }
  if (verdict !== 'admin') {
    throw new ProjectApiError(
      403,
      'Linking a Cloudflare resource needs access to the Cloud section, so it cannot be verified for this account',
      'unverifiable',
    );
  }

  let config: CloudflareConfig;
  try {
    config = await access.credential();
  } catch (error) {
    if (error instanceof CloudflareApiError) {
      throw new ProjectApiError(
        503,
        `Cannot verify: ${error.message}`,
        'unverifiable',
      );
    }
    throw error;
  }

  const outcome = await verifyCloudflareResource(
    link.type,
    link.resourceId,
    (access.reader ?? cloudflareInventoryReader)(config),
  );

  if (outcome.status === 'not-found') {
    throw new ProjectApiError(
      422,
      `${label} "${link.resourceId}" was not found in the connected Cloudflare account`,
      'not-found',
    );
  }
  if (outcome.status === 'unverifiable') {
    const permission = outcome.httpStatus === 401 || outcome.httpStatus === 403;
    throw new ProjectApiError(
      permission ? 403 : 503,
      `Cannot verify ${label}s: ${outcome.reason}`,
      'unverifiable',
    );
  }

  try {
    return await insertResource(projectId, link, outcome.resourceName);
  } catch (error) {
    if (error instanceof ResourceConflictError) {
      throw new ProjectApiError(
        409,
        `This ${label} was just linked to a project`,
        'conflict',
      );
    }
    throw error;
  }
}

/**
 * Removes DevFlare's claim. Never needs Cloudflare — which is also how a link
 * to a resource deleted upstream ("missing") gets cleaned up.
 */
export async function unlinkResourceFor(
  caller: Caller | null,
  projectId: string,
  linkId: string,
): Promise<void> {
  const user = signedIn(caller);
  await owned(user, projectId);
  if (!(await deleteResource(projectId, linkId))) {
    throw new ProjectApiError(404, 'Resource link not found');
  }
}
