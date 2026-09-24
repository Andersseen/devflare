/**
 * "Does this resource exist on the connected Cloudflare account?" — asked
 * before a project may claim it (spec 019).
 *
 * Three answers, never two. `not-found` means Cloudflare listed that product
 * and the resource was not in it. `unverifiable` means the listing itself was
 * refused or failed — a token without R2 permission knows nothing about
 * buckets, and treating that as "not found" (or, worse, as "fine") would be
 * making the answer up.
 *
 * No h3 here, so it stays unit-testable; the route maps outcomes to statuses.
 */

import {
  CloudflareApiError,
  listD1Databases,
  listKvNamespaces,
  listPagesProjects,
  listR2Buckets,
  listWorkers,
  type CloudflareConfig,
} from './cloudflare';
import type { ProjectResourceType } from './project-rows';

/** One resource as the inventory knows it: stable id plus current label. */
export interface InventoryRef {
  resourceId: string;
  resourceName: string;
}

export type InventoryReader = (
  type: ProjectResourceType,
  refresh: boolean,
) => Promise<InventoryRef[]>;

export type VerifyOutcome =
  | { status: 'found'; resourceId: string; resourceName: string }
  | { status: 'not-found' }
  | {
      status: 'unverifiable';
      reason: string;
      /** Upstream status: 401/403 is a permission problem, else availability. */
      httpStatus: number;
    };

/**
 * Maps each product's listing to the identifier this table stores. D1 and KV
 * have a stable id distinct from their (renamable) label, so the id is the
 * key; Workers, Pages and R2 are addressed by name everywhere in the API, and
 * the name is what cannot change.
 */
export function cloudflareInventoryReader(
  config: CloudflareConfig,
): InventoryReader {
  return async (type, refresh) => {
    switch (type) {
      case 'worker':
        return (await listWorkers(config, refresh)).map((script) => ({
          resourceId: script.id,
          resourceName: script.id,
        }));
      case 'pages':
        return (await listPagesProjects(config, refresh)).map((project) => ({
          resourceId: project.name,
          resourceName: project.name,
        }));
      case 'd1':
        return (await listD1Databases(config, refresh)).map((database) => ({
          resourceId: database.uuid,
          resourceName: database.name,
        }));
      case 'kv':
        return (await listKvNamespaces(config, refresh)).map((namespace) => ({
          resourceId: namespace.id,
          resourceName: namespace.title,
        }));
      case 'r2':
        return (await listR2Buckets(config, refresh)).map((bucket) => ({
          resourceId: bucket.name,
          resourceName: bucket.name,
        }));
    }
  };
}

export async function verifyCloudflareResource(
  type: ProjectResourceType,
  resourceId: string,
  read: InventoryReader,
): Promise<VerifyOutcome> {
  try {
    // The memoized listing first; a miss is re-asked fresh, because a resource
    // created in the last minute is exactly the one someone is about to link.
    const match =
      (await read(type, false)).find((ref) => ref.resourceId === resourceId) ??
      (await read(type, true)).find((ref) => ref.resourceId === resourceId);

    return match
      ? {
          status: 'found',
          resourceId: match.resourceId,
          resourceName: match.resourceName,
        }
      : { status: 'not-found' };
  } catch (error) {
    if (error instanceof CloudflareApiError) {
      return {
        status: 'unverifiable',
        reason: error.message,
        httpStatus: error.status,
      };
    }
    return {
      status: 'unverifiable',
      reason: 'Cloudflare could not be asked',
      httpStatus: 502,
    };
  }
}

export const RESOURCE_TYPE_LABELS: Record<ProjectResourceType, string> = {
  worker: 'Worker',
  pages: 'Pages project',
  d1: 'D1 database',
  kv: 'KV namespace',
  r2: 'R2 bucket',
};
