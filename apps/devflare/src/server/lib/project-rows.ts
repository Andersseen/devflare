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
 */

export interface ProjectRow {
  id: string;
  userId: string;
  name: string;
  repoUrl: string | null;
  createdAt: string;
  /** 'worker' | 'pages' | null — spec 005. */
  cfType: string | null;
  cfName: string | null;
}

interface SqlResult<T> {
  rows?: T[];
}

export function rowsOf<T>(result: unknown): T[] {
  return (result as SqlResult<T>)?.rows ?? [];
}

export type CloudflareResourceType = 'worker' | 'pages';

/**
 * A link is either both halves or neither. Anything else would leave a row that
 * names a resource without saying what kind it is.
 */
export function parseLink(body: unknown): {
  cfType: CloudflareResourceType | null;
  cfName: string | null;
} {
  const input = (body ?? {}) as { cfType?: unknown; cfName?: unknown };

  if (
    input.cfType === null ||
    input.cfType === undefined ||
    input.cfType === ''
  ) {
    return { cfType: null, cfName: null };
  }

  if (input.cfType !== 'worker' && input.cfType !== 'pages') {
    throw new Error('cfType must be "worker" or "pages"');
  }

  if (typeof input.cfName !== 'string' || !input.cfName.trim()) {
    throw new Error('cfName is required when cfType is set');
  }

  return { cfType: input.cfType, cfName: input.cfName.trim() };
}
