import { db } from '../db';
import {
  attachResources,
  rowsOf,
  type ProjectResourceRow,
  type ProjectResourceType,
  type ProjectRow,
  type ProjectWithResources,
  type ResourceLinkInput,
  type ResourceProvider,
} from './project-rows';

/**
 * Every query the project routes run (spec 019), in one place so that each
 * route stays "authenticate, parse, call, answer" — and so the whole set can be
 * exercised against a real SQLite database in project-store.spec.ts.
 *
 * Every read and write that takes a project id also takes the caller's user id:
 * ownership is proved in the query itself, never by trusting the id alone.
 */

export async function listProjects(
  userId: string,
): Promise<ProjectWithResources[]> {
  const projects = rowsOf<ProjectRow>(
    await db.sql`SELECT id, userId, name, repoUrl, createdAt FROM projects WHERE userId = ${userId} ORDER BY createdAt DESC`,
  );
  if (!projects.length) return [];

  const resources = rowsOf<ProjectResourceRow>(
    await db.sql`SELECT r.id, r.projectId, r.provider, r.type, r.resourceId, r.resourceName, r.createdAt
      FROM project_resource r
      JOIN projects p ON p.id = r.projectId
      WHERE p.userId = ${userId}
      ORDER BY r.createdAt ASC, r.resourceName ASC`,
  );

  return attachResources(projects, resources);
}

export async function getOwnedProject(
  userId: string,
  id: string,
): Promise<ProjectWithResources | null> {
  const project = rowsOf<ProjectRow>(
    await db.sql`SELECT id, userId, name, repoUrl, createdAt FROM projects WHERE id = ${id} AND userId = ${userId}`,
  )[0];
  if (!project) return null;

  return attachResources([project], await listResources(project.id))[0];
}

export async function listResources(
  projectId: string,
): Promise<ProjectResourceRow[]> {
  return rowsOf<ProjectResourceRow>(
    await db.sql`SELECT id, projectId, provider, type, resourceId, resourceName, createdAt
      FROM project_resource
      WHERE projectId = ${projectId}
      ORDER BY createdAt ASC, resourceName ASC`,
  );
}

export async function createProject(
  userId: string,
  input: { name: string; repoUrl: string | null },
): Promise<ProjectWithResources> {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await db.sql`INSERT INTO projects (id, userId, name, repoUrl, createdAt) VALUES (${id}, ${userId}, ${input.name}, ${input.repoUrl}, ${createdAt})`;

  return {
    id,
    userId,
    name: input.name,
    repoUrl: input.repoUrl,
    createdAt,
    resources: [],
  };
}

export async function updateProject(
  userId: string,
  id: string,
  patch: { name?: string; repoUrl?: string | null },
): Promise<ProjectWithResources | null> {
  // One statement per field keeps every value parameterized without building
  // SQL text from the patch's keys.
  if (patch.name !== undefined) {
    await db.sql`UPDATE projects SET name = ${patch.name} WHERE id = ${id} AND userId = ${userId}`;
  }
  if (patch.repoUrl !== undefined) {
    await db.sql`UPDATE projects SET repoUrl = ${patch.repoUrl} WHERE id = ${id} AND userId = ${userId}`;
  }
  return getOwnedProject(userId, id);
}

/**
 * Removes the project and everything DevFlare recorded *about* it: its
 * resource links and its own deployment log. Nothing on Cloudflare is touched.
 *
 * The children go first and explicitly. `project_resource` would cascade on
 * its own, but `deployments` (0000) has a plain foreign key with no ON DELETE,
 * so with D1's enforced foreign keys a project that had ever been deployed
 * through DevFlare could not be deleted at all.
 */
export async function deleteProject(
  userId: string,
  id: string,
): Promise<boolean> {
  const owned = await getOwnedProject(userId, id);
  if (!owned) return false;

  await db.sql`DELETE FROM deployments WHERE projectId = ${id}`;
  await db.sql`DELETE FROM project_resource WHERE projectId = ${id}`;
  await db.sql`DELETE FROM projects WHERE id = ${id} AND userId = ${userId}`;
  return true;
}

export interface ResourceOwner {
  link: ProjectResourceRow;
  project: ProjectRow;
}

/** Who, across the whole install, owns this resource — if anyone. */
export async function findResourceOwner(
  provider: ResourceProvider,
  type: ProjectResourceType,
  resourceId: string,
): Promise<ResourceOwner | null> {
  const link = rowsOf<ProjectResourceRow>(
    await db.sql`SELECT id, projectId, provider, type, resourceId, resourceName, createdAt
      FROM project_resource
      WHERE provider = ${provider} AND type = ${type} AND resourceId = ${resourceId}`,
  )[0];
  if (!link) return null;

  const project = rowsOf<ProjectRow>(
    await db.sql`SELECT id, userId, name, repoUrl, createdAt FROM projects WHERE id = ${link.projectId}`,
  )[0];
  return project ? { link, project } : null;
}

/** Raised when the unique index refuses a second owner (a lost race). */
export class ResourceConflictError extends Error {
  constructor() {
    super('This resource is already linked to a project');
    this.name = 'ResourceConflictError';
  }
}

export async function insertResource(
  projectId: string,
  link: ResourceLinkInput,
  resourceName: string,
): Promise<ProjectResourceRow> {
  const row: ProjectResourceRow = {
    id: crypto.randomUUID(),
    projectId,
    provider: link.provider,
    type: link.type,
    resourceId: link.resourceId,
    resourceName,
    createdAt: new Date().toISOString(),
  };

  try {
    await db.sql`INSERT INTO project_resource (id, projectId, provider, type, resourceId, resourceName, createdAt)
      VALUES (${row.id}, ${row.projectId}, ${row.provider}, ${row.type}, ${row.resourceId}, ${row.resourceName}, ${row.createdAt})`;
  } catch (error) {
    if (
      error instanceof Error &&
      /UNIQUE constraint failed/i.test(error.message)
    ) {
      throw new ResourceConflictError();
    }
    throw error;
  }

  return row;
}

/** Unlinks one resource from one project. False when there was no such link. */
export async function deleteResource(
  projectId: string,
  linkId: string,
): Promise<boolean> {
  const existing = rowsOf<{ id: string }>(
    await db.sql`SELECT id FROM project_resource WHERE id = ${linkId} AND projectId = ${projectId}`,
  );
  if (!existing.length) return false;

  await db.sql`DELETE FROM project_resource WHERE id = ${linkId} AND projectId = ${projectId}`;
  return true;
}

/**
 * The caller's project that explicitly owns this Pages project. Used to file a
 * DevFlare-made deployment under its owner without asking the browser — and
 * without guessing from names.
 */
export async function findPagesOwner(
  userId: string,
  pagesName: string,
): Promise<ProjectRow | null> {
  return (
    rowsOf<ProjectRow>(
      await db.sql`SELECT p.id, p.userId, p.name, p.repoUrl, p.createdAt
        FROM project_resource r
        JOIN projects p ON p.id = r.projectId
        WHERE r.provider = 'cloudflare' AND r.type = 'pages'
          AND r.resourceId = ${pagesName} AND p.userId = ${userId}`,
    )[0] ?? null
  );
}
