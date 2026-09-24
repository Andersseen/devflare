import { Injectable, computed, signal } from '@angular/core';
import { ownershipIndex } from './project-resources';

/**
 * The Cloudflare resource kinds a project can own (spec 019). The five the
 * Cloud section already reads: a type DevFlare cannot list is a type it cannot
 * verify, so it cannot be linked.
 */
export type ProjectResourceType = 'pages' | 'worker' | 'd1' | 'r2' | 'kv';

export const PROJECT_RESOURCE_TYPES: readonly ProjectResourceType[] = [
  'pages',
  'worker',
  'd1',
  'r2',
  'kv',
];

/**
 * One persisted ownership link: DevFlare's claim that this resource belongs to
 * this project. Identity only — what the resource looks like right now comes
 * from Cloudflare (see ./project-resources.ts).
 */
export interface ProjectResource {
  id: string;
  projectId: string;
  provider: 'cloudflare';
  type: ProjectResourceType;
  /**
   * The stable Cloudflare identifier: script name, Pages project name, D1
   * uuid, KV namespace id, R2 bucket name.
   */
  resourceId: string;
  /** The label when it was linked. A D1 name or KV title can change later. */
  resourceName: string;
  createdAt: string;
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  repoUrl: string | null;
  createdAt: string;
  resources: ProjectResource[];
}

/**
 * One deployment DevFlare itself made (spec 006). Distinct from `/cloud`, which
 * shows everything the account has from any source and cannot say which came
 * from here.
 */
export interface Deployment {
  id: string;
  projectId: string;
  status: string;
  commitSha: string | null;
  previewUrl: string | null;
  createdAt: string;
}

/**
 * Why a link was refused, as the server reports it. `unverifiable` is not
 * `not-found`: it means Cloudflare could not be asked (permission, no account),
 * so nothing is known about the resource either way.
 */
export type ProjectRequestReason =
  | 'invalid'
  | 'conflict'
  | 'not-found'
  | 'unverifiable';

export class ProjectRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason: ProjectRequestReason | null,
  ) {
    super(message);
    this.name = 'ProjectRequestError';
  }
}

const BASE = '/api/v1/projects';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers:
      init.body === undefined
        ? undefined
        : { 'Content-Type': 'application/json' },
    ...init,
  });

  const text = await response.text();
  let payload: {
    statusMessage?: string;
    data?: { reason?: ProjectRequestReason | null; error?: string };
  } | null = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new ProjectRequestError(
      payload?.data?.error ??
        payload?.statusMessage ??
        `Request failed with ${response.status}`,
      response.status,
      payload?.data?.reason ?? null,
    );
  }

  return payload as T;
}

/**
 * Projects and the resources they own. One service, one API, used by every
 * screen that shows or changes ownership — the project page, the dashboard and
 * the Cloud views — so there is exactly one way a link gets made.
 *
 * The list is kept in a signal because several pieces of one screen read it
 * (a Cloud list shows an owner on every row); each mutation updates it in place
 * rather than refetching.
 */
@Injectable({
  providedIn: 'root',
})
export class Projects {
  readonly #list = signal<Project[] | null>(null);
  #inFlight: Promise<Project[]> | null = null;

  /** Null until first loaded. */
  readonly list = this.#list.asReadonly();
  readonly loaded = computed(() => this.#list() !== null);
  /** Which project owns each resource, by `resourceKey(type, resourceId)`. */
  readonly ownership = computed(() => ownershipIndex(this.#list() ?? []));

  /** Always asks the server. */
  async getProjects(): Promise<Project[]> {
    const { projects } = await request<{ projects: Project[] }>('');
    this.#list.set(projects);
    return projects;
  }

  /** The cached list, fetched once if nobody has asked yet. */
  ensureLoaded(): Promise<Project[]> {
    const current = this.#list();
    if (current) return Promise.resolve(current);
    this.#inFlight ??= this.getProjects().finally(() => {
      this.#inFlight = null;
    });
    return this.#inFlight;
  }

  /** Name and optional repository. Resources are linked afterwards. */
  async createProject(name: string, repoUrl?: string): Promise<Project> {
    const { project } = await request<{ project: Project }>('', {
      method: 'POST',
      body: JSON.stringify({ name, repoUrl: repoUrl || null }),
    });
    this.#list.update((list) => (list ? [project, ...list] : list));
    return project;
  }

  async updateProject(
    id: string,
    patch: { name?: string; repoUrl?: string | null },
  ): Promise<Project> {
    const { project } = await request<{ project: Project }>(`/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    this.#replace(project);
    return project;
  }

  async deleteProject(id: string): Promise<void> {
    await request<{ success: boolean }>(`/${id}`, { method: 'DELETE' });
    this.#list.update((list) =>
      list ? list.filter((project) => project.id !== id) : list,
    );
  }

  /**
   * Claims one Cloudflare resource for the project. The server checks it
   * exists first; a refusal arrives as a `ProjectRequestError` with a reason.
   */
  async linkResource(
    projectId: string,
    resource: { type: ProjectResourceType; resourceId: string },
  ): Promise<ProjectResource> {
    const { resource: link } = await request<{ resource: ProjectResource }>(
      `/${projectId}/resources`,
      {
        method: 'POST',
        body: JSON.stringify({ provider: 'cloudflare', ...resource }),
      },
    );
    this.#update(projectId, (project) => ({
      ...project,
      resources: [...project.resources, link],
    }));
    return link;
  }

  /** `linkId` is the link's own id (`resources[].id`). */
  async unlinkResource(projectId: string, linkId: string): Promise<void> {
    await request<{ success: boolean }>(
      `/${projectId}/resources/${encodeURIComponent(linkId)}`,
      { method: 'DELETE' },
    );
    this.#update(projectId, (project) => ({
      ...project,
      resources: project.resources.filter((link) => link.id !== linkId),
    }));
  }

  /** What this app has deployed for the project, newest first. */
  async getDeployments(id: string): Promise<Deployment[]> {
    const { deployments } = await request<{ deployments: Deployment[] }>(
      `/${id}/deployments`,
    );
    return deployments;
  }

  #replace(project: Project): void {
    this.#update(project.id, () => project);
  }

  #update(id: string, change: (project: Project) => Project): void {
    this.#list.update((list) =>
      list
        ? list.map((project) => (project.id === id ? change(project) : project))
        : list,
    );
  }
}
