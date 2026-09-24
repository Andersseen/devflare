import {
  allInventoryRefs,
  discoveredResource,
  ownershipIndex,
  resolveProjectResources,
  resourceActivity,
  resourceKey,
  type CloudDeployment,
  type CloudInventory,
  type CloudPagesProject,
  type CloudResourceRef,
  type CloudWorker,
  type Project,
  type ResolvedResource,
} from '@org/core';

/**
 * The Projects dashboard's model (spec 019).
 *
 * Two kinds of project, never confused:
 *
 * - **Saved** projects are DevFlare's own rows. What they own is exactly their
 *   persisted `ProjectResource` links — resolved against Cloudflare so a link
 *   whose resource vanished shows as missing instead of disappearing.
 * - **Discovered** projects are Workers and Pages nobody owns yet, grouped by
 *   name the way the dashboard always did. They are suggestions: nothing is
 *   persisted until someone saves one.
 *
 * Name matching never creates ownership. It only (a) groups unowned resources
 * into discovered projects and (b) suggests unowned resources to a saved
 * project whose name they resemble, for its owner to link or ignore.
 */

export interface WatchedProject {
  name: string;
  slug: string;
  aliases?: string[];
  /**
   * Public domains verified in production but not returned by the current
   * Cloudflare Pages/Workers-domain permissions (for example Worker routes).
   */
  verifiedDomains?: string[];
}

export type ProjectViewKind = 'saved' | 'discovered';

export interface ProjectView {
  kind: ProjectViewKind;
  name: string;
  slug: string;
  /** The saved row. Null for a discovered project. */
  project: Project | null;
  /**
   * Saved: every persisted link, resolved (available / missing / unverifiable).
   * Discovered: the grouped resources, all available, none persisted.
   */
  resources: ResolvedResource[];
  /** Saved only: unowned resources whose names resemble this project. */
  suggestions: CloudResourceRef[];
  /** The available Pages projects and Workers — for URLs and deployments. */
  pages: CloudPagesProject[];
  workers: CloudWorker[];
  repoUrl: string | null;
  url: string | null;
  /** Route-only URLs rendered separately from the resource cards. */
  verifiedUrls: string[];
  lastActivity: string | null;
  /** Newest Pages deployment across the project, with the project it belongs to. */
  latestDeployment: LatestDeployment | null;
}

export interface LatestDeployment {
  pagesProject: string;
  deployment: CloudDeployment;
}

export interface ProjectViews {
  projects: ProjectView[];
  discovered: ProjectView[];
}

export const WATCHED_PROJECTS: WatchedProject[] = [
  {
    name: 'DevFlare',
    slug: 'devflare',
    aliases: [
      'dev-auth',
      'dev-auth-prod',
      'dev-auth-staging',
      'auth-devflare',
      'worker-devflare-hono',
      'devflare-worker',
      'control-bucket',
    ],
  },
  {
    name: 'Volt UI',
    slug: 'volt-ui',
    aliases: ['voltui'],
    verifiedDomains: ['volt-ui.andersseen.dev'],
  },
  {
    name: 'Angular Movement',
    slug: 'angular-movement',
    aliases: ['angular movemnt'],
    verifiedDomains: ['angular-movement.andersseen.dev'],
  },
  {
    name: 'Lumen Icons',
    slug: 'lumen-icons',
    aliases: ['lumen iconos'],
    verifiedDomains: ['lumen-icons.andersseen.dev'],
  },
  { name: 'ForgeCMS', slug: 'forgecms', aliases: ['forge cms'] },
  { name: 'Etym', slug: 'etym', aliases: ['etyma'] },
  { name: 'Ally', slug: 'ally' },
  { name: 'ImageryX', slug: 'imageryx', aliases: ['imageryx'] },
  {
    name: 'Andersseen Dev',
    slug: 'andersseen-dev',
    aliases: ['andersseen-dev', 'andersseen dev', 'my-blog'],
  },
];

export function buildProjectViews(input: {
  saved: readonly Project[];
  inventory: CloudInventory | null;
  /** Why `inventory` is null — shown on every saved link. */
  unavailable?: string;
}): ProjectViews {
  const owned = ownershipIndex(input.saved);
  const unowned = input.inventory
    ? allInventoryRefs(input.inventory).filter(
        (ref) => !owned.has(resourceKey(ref.type, ref.resourceId)),
      )
    : [];
  const claimed = new Set<string>();
  const slugs = new Set<string>();

  // Oldest first, so a suggestion two projects both resemble goes to the one
  // that existed first — deterministic, and still only a suggestion.
  const byAge = [...input.saved].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );

  const projects = byAge.map((project) => {
    const watched = watchedFor(project.name);
    const suggestions = unowned.filter(
      (ref) =>
        !claimed.has(resourceKey(ref.type, ref.resourceId)) &&
        (watched
          ? matchesWatchedProject(watched, ref.name)
          : matchesName(project.name, ref.name)),
    );
    for (const ref of suggestions) {
      claimed.add(resourceKey(ref.type, ref.resourceId));
    }

    return toView({
      kind: 'saved',
      name: project.name,
      slug: uniqueSlug(
        slugFromName(project.name) || project.id,
        slugs,
        () => `${slugFromName(project.name)}-${project.id.slice(0, 8)}`,
      ),
      project,
      resources: resolveProjectResources(
        project.resources,
        input.inventory,
        input.unavailable,
      ),
      suggestions,
      repoUrl: project.repoUrl,
      verifiedDomains: watched?.verifiedDomains ?? [],
    });
  });

  // Discovered projects are built only from the kinds the dashboard always
  // grouped. A lone bucket or namespace is not a project; it is found from the
  // Cloud section or suggested to a saved project.
  const remaining = unowned.filter(
    (ref) =>
      !claimed.has(resourceKey(ref.type, ref.resourceId)) &&
      (ref.type === 'pages' || ref.type === 'worker'),
  );
  const used = new Set<string>();
  const discovered: ProjectView[] = [];

  const savedWatched = new Set(
    input.saved.map((project) => watchedFor(project.name)?.slug),
  );

  for (const watched of WATCHED_PROJECTS) {
    if (savedWatched.has(watched.slug)) continue;
    const refs = remaining.filter(
      (ref) =>
        !used.has(resourceKey(ref.type, ref.resourceId)) &&
        matchesWatchedProject(watched, ref.name),
    );
    // A route-only site (verified domain, no Pages/Worker the token can see)
    // is still a live project worth listing.
    if (!refs.length && !watched.verifiedDomains?.length) continue;
    for (const ref of refs) used.add(resourceKey(ref.type, ref.resourceId));

    discovered.push(
      discoveredView(watched.name, watched.slug, refs, slugs, watched),
    );
  }

  for (const ref of remaining) {
    if (used.has(resourceKey(ref.type, ref.resourceId))) continue;
    used.add(resourceKey(ref.type, ref.resourceId));
    discovered.push(
      discoveredView(ref.name, slugFromName(ref.name), [ref], slugs),
    );
  }

  return {
    projects: byActivity(projects),
    discovered: byActivity(discovered),
  };
}

export function findProjectView(
  slug: string,
  views: ProjectViews,
): ProjectView | null {
  return (
    views.projects.find((view) => view.slug === slug) ??
    // Links from elsewhere (the Cloud views) use the id, which never changes.
    views.projects.find((view) => view.project?.id === slug) ??
    views.discovered.find((view) => view.slug === slug) ??
    null
  );
}

/** Links whose resource is missing or unverifiable — worth flagging on a card. */
export function unresolvedCount(view: ProjectView): number {
  return view.resources.filter((resource) => resource.state !== 'available')
    .length;
}

export function resourceUrl(
  project: CloudPagesProject | null,
  worker: CloudWorker | null,
): string | null {
  return resourceUrls(project, worker)[0] ?? null;
}

/**
 * Every public URL Cloudflare reported for a resource, with its custom hostname
 * ahead of the generated Pages fallback. Cloudflare currently sends `.pages.dev`
 * first, but that is rarely the address an owner wants to share.
 */
export function resourceUrls(
  project: CloudPagesProject | null,
  worker: CloudWorker | null,
): string[] {
  const domains = [
    ...(project?.domains ?? []),
    ...(project?.subdomain ? [project.subdomain] : []),
    ...(worker?.domains ?? []),
  ];
  const unique = [...new Set(domains)];

  return unique
    .sort(
      (left, right) =>
        Number(left.endsWith('.pages.dev')) -
        Number(right.endsWith('.pages.dev')),
    )
    .map((domain) => `https://${domain}`);
}

export function repoHref(repoUrl: string | null, repo: string | null): string {
  if (repoUrl) return repoUrl;
  if (!repo) return '#';
  return repo.startsWith('http') ? repo : `https://github.com/${repo}`;
}

/** "github.com/andersseen/ally" — the part of a repository URL worth reading. */
export function repoLabel(href: string): string {
  return href.replace(/^https?:\/\//, '');
}

/**
 * Only Pages reports deployments in the overview payload; Workers expose
 * versions, which need a per-Worker request and are shown on the Worker page.
 */
export function latestDeployment(
  pages: readonly CloudPagesProject[],
): LatestDeployment | null {
  let newest: LatestDeployment | null = null;

  for (const project of pages) {
    const deployment = project.latestDeployment;
    if (!deployment) continue;

    const time = new Date(deployment.createdOn).getTime();
    if (!Number.isFinite(time)) continue;

    if (!newest || time > new Date(newest.deployment.createdOn).getTime()) {
      newest = { pagesProject: project.name, deployment };
    }
  }

  return newest;
}

export function slugFromName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function discoveredView(
  name: string,
  slug: string,
  refs: CloudResourceRef[],
  slugs: Set<string>,
  watched?: WatchedProject,
): ProjectView {
  const resources = refs.map(discoveredResource);
  const pagesRepo =
    resources.find(
      (resource) =>
        resource.detail?.type === 'pages' && resource.detail.pages.repo,
    )?.detail ?? null;

  return toView({
    kind: 'discovered',
    name,
    slug: uniqueSlug(slug || 'project', slugs, () => `${slug}-cloud`),
    project: null,
    resources,
    suggestions: [],
    repoUrl:
      pagesRepo?.type === 'pages' && pagesRepo.pages.repo
        ? repoHref(null, pagesRepo.pages.repo)
        : null,
    verifiedDomains: watched?.verifiedDomains ?? [],
  });
}

function toView(input: {
  kind: ProjectViewKind;
  name: string;
  slug: string;
  project: Project | null;
  resources: ResolvedResource[];
  suggestions: CloudResourceRef[];
  repoUrl: string | null;
  verifiedDomains: readonly string[];
}): ProjectView {
  const pages: CloudPagesProject[] = [];
  const workers: CloudWorker[] = [];
  for (const resource of input.resources) {
    if (resource.detail?.type === 'pages') pages.push(resource.detail.pages);
    if (resource.detail?.type === 'worker') {
      workers.push(resource.detail.worker);
    }
  }

  const verifiedUrls = input.verifiedDomains.map(
    (domain) => `https://${domain}`,
  );
  const publicUrls = uniquePublicUrls([
    ...verifiedUrls,
    ...pages.flatMap((project) => resourceUrls(project, null)),
    ...workers.flatMap((worker) => resourceUrls(null, worker)),
  ]);

  const pagesRepo = pages.find((project) => project.repo)?.repo ?? null;

  return {
    kind: input.kind,
    name: input.name,
    slug: input.slug,
    project: input.project,
    resources: input.resources,
    suggestions: input.suggestions,
    pages,
    workers,
    repoUrl: input.repoUrl ?? (pagesRepo ? repoHref(null, pagesRepo) : null),
    url: publicUrls[0] ?? null,
    verifiedUrls,
    lastActivity: newest(
      input.resources.map((resource) => resourceActivity(resource.detail)),
    ),
    latestDeployment: latestDeployment(pages),
  };
}

function byActivity(views: ProjectView[]): ProjectView[] {
  const time = (view: ProjectView) =>
    new Date(view.lastActivity ?? view.project?.createdAt ?? 0).getTime() || 0;
  return [...views].sort((a, b) => time(b) - time(a));
}

function newest(dates: readonly (string | null)[]): string | null {
  const times = dates
    .filter((date): date is string => Boolean(date))
    .map((date) => new Date(date).getTime())
    .filter(Number.isFinite);
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}

function uniqueSlug(
  preferred: string,
  taken: Set<string>,
  fallback: () => string,
): string {
  let slug = taken.has(preferred) ? fallback() : preferred;
  let counter = 2;
  while (taken.has(slug)) slug = `${preferred}-${counter++}`;
  taken.add(slug);
  return slug;
}

function uniquePublicUrls(urls: readonly string[]): string[] {
  return [...new Set(urls)].sort(
    (left, right) =>
      Number(left.endsWith('.pages.dev')) -
      Number(right.endsWith('.pages.dev')),
  );
}

/** The watched entry a saved project *is*, by exact name, slug or alias. */
function watchedFor(name: string): WatchedProject | null {
  const normalized = normalizeName(name);
  return (
    WATCHED_PROJECTS.find((watched) =>
      [watched.name, watched.slug, ...(watched.aliases ?? [])]
        .map(normalizeName)
        .includes(normalized),
    ) ?? null
  );
}

function matchesWatchedProject(
  target: WatchedProject,
  candidate: string,
): boolean {
  return [target.name, target.slug, ...(target.aliases ?? [])].some((name) =>
    matchesName(name, candidate),
  );
}

function matchesName(name: string, candidate: string): boolean {
  const accepted = normalizeName(name);
  // Too short to mean anything: "ui" would claim half the account.
  if (accepted.length < 3) return false;
  return normalizeName(candidate).includes(accepted);
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}
