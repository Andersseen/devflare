import type {
  CloudBucket,
  CloudDatabase,
  CloudNamespace,
  CloudPagesProject,
  CloudStorageSection,
  CloudWorker,
} from './cloudflare-account.service';
import type {
  Project,
  ProjectResource,
  ProjectResourceType,
} from './projects.service';

/**
 * Project resources, resolved (spec 019).
 *
 * Two truths meet here. DevFlare's database says what a project *owns*
 * (`ProjectResource` links). Cloudflare says what *exists* right now (the
 * inventory). Neither is allowed to overwrite the other: a link whose resource
 * Cloudflare no longer lists is shown as `missing`, not hidden, and a link whose
 * product the token cannot read is `unverifiable`, not "0" and not "fine".
 *
 * Pure functions — every screen that shows ownership goes through them, so no
 * page joins projects and inventory by hand.
 */

/**
 * The account, per product. Each product is a separate token permission, so
 * each carries its own error: `{ items: [], error: null }` is "none",
 * `{ items: [], error: '…' }` is "unknown".
 */
export interface CloudInventory {
  worker: CloudStorageSection<CloudWorker>;
  pages: CloudStorageSection<CloudPagesProject>;
  d1: CloudStorageSection<CloudDatabase>;
  kv: CloudStorageSection<CloudNamespace>;
  r2: CloudStorageSection<CloudBucket>;
}

/** What Cloudflare currently reports about one resource. */
export type CloudResourceDetail =
  | { type: 'worker'; worker: CloudWorker }
  | { type: 'pages'; pages: CloudPagesProject }
  | { type: 'd1'; database: CloudDatabase }
  | { type: 'kv'; namespace: CloudNamespace }
  | { type: 'r2'; bucket: CloudBucket };

/** One inventory entry under the identifier ownership is keyed on. */
export interface CloudResourceRef {
  type: ProjectResourceType;
  resourceId: string;
  name: string;
  detail: CloudResourceDetail;
}

export type ResourceState = 'available' | 'missing' | 'unverifiable';

export interface ResolvedResource {
  /** The persisted link. Null for a resource that is only discovered. */
  link: ProjectResource | null;
  type: ProjectResourceType;
  resourceId: string;
  /** Cloudflare's current label when known, else the one stored at link time. */
  name: string;
  state: ResourceState;
  /** Why it is not `available`. */
  reason: string | null;
  detail: CloudResourceDetail | null;
}

export type ResourceGroupId = 'web' | 'compute' | 'storage';

export interface ResourceTypeMeta {
  /** "Worker", "Pages", "D1" … */
  label: string;
  plural: string;
  /** What to call the thing in a sentence: "Worker", "Pages project" … */
  noun: string;
  group: ResourceGroupId;
  /** lucide icon name. */
  icon: string;
}

export const RESOURCE_TYPE_META: Record<ProjectResourceType, ResourceTypeMeta> =
  {
    pages: {
      label: 'Pages',
      plural: 'Pages',
      noun: 'Pages project',
      group: 'web',
      icon: 'globe',
    },
    worker: {
      label: 'Worker',
      plural: 'Workers',
      noun: 'Worker',
      group: 'compute',
      icon: 'zap',
    },
    d1: {
      label: 'D1',
      plural: 'D1',
      noun: 'D1 database',
      group: 'storage',
      icon: 'database',
    },
    r2: {
      label: 'R2',
      plural: 'R2',
      noun: 'R2 bucket',
      group: 'storage',
      icon: 'hard-drive',
    },
    kv: {
      label: 'KV',
      plural: 'KV',
      noun: 'KV namespace',
      group: 'storage',
      icon: 'boxes',
    },
  };

/** The one order every inventory is shown in. */
export const RESOURCE_GROUPS: readonly {
  id: ResourceGroupId;
  label: string;
  types: readonly ProjectResourceType[];
}[] = [
  { id: 'web', label: 'Web', types: ['pages'] },
  { id: 'compute', label: 'Compute', types: ['worker'] },
  { id: 'storage', label: 'Storage', types: ['d1', 'r2', 'kv'] },
];

export function resourceKey(
  type: ProjectResourceType,
  resourceId: string,
): string {
  return `${type}:${resourceId}`;
}

/** "2 Workers", "1 Pages", "3 R2". */
export function countLabel(type: ProjectResourceType, count: number): string {
  const meta = RESOURCE_TYPE_META[type];
  return `${count} ${count === 1 ? meta.label : meta.plural}`;
}

/**
 * Maps each product's listing onto the identifier the link stores: D1 and KV
 * by their id (their name/title can change), Workers, Pages and R2 by the name
 * Cloudflare addresses them with, which cannot.
 */
export function inventoryRefs(
  inventory: CloudInventory,
  type: ProjectResourceType,
): CloudResourceRef[] {
  switch (type) {
    case 'worker':
      return inventory.worker.items.map((worker) => ({
        type,
        resourceId: worker.name,
        name: worker.name,
        detail: { type, worker },
      }));
    case 'pages':
      return inventory.pages.items.map((pages) => ({
        type,
        resourceId: pages.name,
        name: pages.name,
        detail: { type, pages },
      }));
    case 'd1':
      return inventory.d1.items.map((database) => ({
        type,
        resourceId: database.id,
        name: database.name,
        detail: { type, database },
      }));
    case 'kv':
      return inventory.kv.items.map((namespace) => ({
        type,
        resourceId: namespace.id,
        name: namespace.name,
        detail: { type, namespace },
      }));
    case 'r2':
      return inventory.r2.items.map((bucket) => ({
        type,
        resourceId: bucket.name,
        name: bucket.name,
        detail: { type, bucket },
      }));
  }
}

export function allInventoryRefs(
  inventory: CloudInventory,
): CloudResourceRef[] {
  return RESOURCE_GROUPS.flatMap((group) =>
    group.types.flatMap((type) => inventoryRefs(inventory, type)),
  );
}

/**
 * Every persisted link, with what Cloudflare says about it now.
 *
 * `inventory` null means the account could not be read at all (not connected,
 * not an administrator); `unavailable` is then the reason shown on every link.
 */
export function resolveProjectResources(
  links: readonly ProjectResource[],
  inventory: CloudInventory | null,
  unavailable = 'Cloudflare account not available',
): ResolvedResource[] {
  const byKey = new Map<string, CloudResourceRef>();
  if (inventory) {
    for (const ref of allInventoryRefs(inventory)) {
      byKey.set(resourceKey(ref.type, ref.resourceId), ref);
    }
  }

  return sortResources(
    links.map((link): ResolvedResource => {
      const base = {
        link,
        type: link.type,
        resourceId: link.resourceId,
        name: link.resourceName,
        detail: null,
      };

      if (!inventory) {
        return { ...base, state: 'unverifiable', reason: unavailable };
      }

      const error = inventory[link.type].error;
      if (error) {
        return { ...base, state: 'unverifiable', reason: error };
      }

      const ref = byKey.get(resourceKey(link.type, link.resourceId));
      if (!ref) {
        return {
          ...base,
          state: 'missing',
          reason: 'Missing from the Cloudflare account',
        };
      }

      return {
        ...base,
        name: ref.name,
        state: 'available',
        reason: null,
        detail: ref.detail,
      };
    }),
  );
}

/** A discovered (not owned) inventory entry, in the same resolved shape. */
export function discoveredResource(ref: CloudResourceRef): ResolvedResource {
  return {
    link: null,
    type: ref.type,
    resourceId: ref.resourceId,
    name: ref.name,
    state: 'available',
    reason: null,
    detail: ref.detail,
  };
}

function sortResources(resources: ResolvedResource[]): ResolvedResource[] {
  const order = RESOURCE_GROUPS.flatMap((group) => group.types);
  return [...resources].sort(
    (a, b) =>
      order.indexOf(a.type) - order.indexOf(b.type) ||
      a.name.localeCompare(b.name),
  );
}

/** Resources split into the Web / Compute / Storage sections, empty ones dropped. */
export function groupResources(
  resources: readonly ResolvedResource[],
): { id: ResourceGroupId; label: string; resources: ResolvedResource[] }[] {
  return RESOURCE_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    resources: sortResources(
      resources.filter((resource) => group.types.includes(resource.type)),
    ),
  })).filter((group) => group.resources.length);
}

/** Non-zero counts, in display order. Counts ownership, whatever the state. */
export function resourceCounts(
  resources: readonly { type: ProjectResourceType }[],
): { type: ProjectResourceType; group: ResourceGroupId; count: number }[] {
  return RESOURCE_GROUPS.flatMap((group) =>
    group.types.map((type) => ({
      type,
      group: group.id,
      count: resources.filter((resource) => resource.type === type).length,
    })),
  ).filter((entry) => entry.count > 0);
}

export interface ResourceOwnership {
  project: Project;
  link: ProjectResource;
}

/** Which of the caller's projects owns each resource, by `resourceKey`. */
export function ownershipIndex(
  projects: readonly Project[],
): Map<string, ResourceOwnership> {
  const index = new Map<string, ResourceOwnership>();
  for (const project of projects) {
    for (const link of project.resources) {
      index.set(resourceKey(link.type, link.resourceId), { project, link });
    }
  }
  return index;
}

export interface LinkCandidate {
  ref: CloudResourceRef;
  /** Set when another project already owns it — shown, but not selectable. */
  owner: ResourceOwnership | null;
}

export interface LinkCandidateSection {
  type: ProjectResourceType;
  /** Set when this product could not be listed — "unavailable", not "none". */
  error: string | null;
  items: LinkCandidate[];
}

/**
 * What the "Link resource" panel offers a project: every inventory entry this
 * project does not already own, per type, in display order.
 */
export function linkCandidates(
  inventory: CloudInventory,
  ownership: ReadonlyMap<string, ResourceOwnership>,
  projectId: string,
): LinkCandidateSection[] {
  return RESOURCE_GROUPS.flatMap((group) => group.types).map((type) => ({
    type,
    error: inventory[type].error,
    items: inventoryRefs(inventory, type)
      .map((ref) => ({
        ref,
        owner: ownership.get(resourceKey(ref.type, ref.resourceId)) ?? null,
      }))
      .filter((candidate) => candidate.owner?.project.id !== projectId)
      .sort((a, b) => a.ref.name.localeCompare(b.ref.name)),
  }));
}

/**
 * Where a resource lives in the Cloud section. D1 and KV have no page of their
 * own, so they open the storage list.
 */
export function cloudResourcePath(
  type: ProjectResourceType,
  resourceId: string,
): string[] {
  switch (type) {
    case 'worker':
      return ['/cloud/workers', resourceId];
    case 'pages':
      return ['/cloud/pages', resourceId];
    case 'r2':
      return ['/cloud/buckets', resourceId];
    case 'd1':
    case 'kv':
      return ['/cloud/storage'];
  }
}

/** When Cloudflare last reported a change: a deploy, an upload. */
export function resourceActivity(
  detail: CloudResourceDetail | null,
): string | null {
  switch (detail?.type) {
    case 'pages':
      return detail.pages.latestDeployment?.createdOn ?? detail.pages.createdOn;
    case 'worker':
      return detail.worker.modifiedOn;
    default:
      return null;
  }
}
