import type { CloudPagesProject, CloudWorker, Project } from '@org/core';

export interface WatchedProject {
  name: string;
  slug: string;
  aliases?: string[];
}

export interface ProjectGroup {
  name: string;
  slug: string;
  savedProjects: Project[];
  pages: CloudPagesProject[];
  workers: CloudWorker[];
  repoUrl: string | null;
  url: string | null;
  lastActivity: string | null;
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
  { name: 'Volt UI', slug: 'volt-ui', aliases: ['voltui'] },
  {
    name: 'Angular Movement',
    slug: 'angular-movement',
    aliases: ['angular movemnt'],
  },
  { name: 'ForgeCMS', slug: 'forgecms', aliases: ['forge cms'] },
  { name: 'Lumen Icons', slug: 'lumen-icons', aliases: ['lumen iconos'] },
  { name: 'Portfolio', slug: 'portfolio' },
  { name: 'Blog', slug: 'blog' },
  { name: 'Etym', slug: 'etym', aliases: ['etyma'] },
  { name: 'Ally', slug: 'ally' },
  { name: 'ImageryX', slug: 'imageryx', aliases: ['imageryx'] },
  {
    name: 'Andersseen Dev',
    slug: 'andersseen-dev',
    aliases: ['andersseen-dev', 'andersseen dev'],
  },
  { name: 'Quartz', slug: 'quartz' },
];

export function groupDashboardProjects(input: {
  saved: Project[];
  pages: CloudPagesProject[];
  workers: CloudWorker[];
}): ProjectGroup[] {
  const usedSaved = new Set<string>();
  const usedPages = new Set<string>();
  const usedWorkers = new Set<string>();
  const groups: ProjectGroup[] = [];

  for (const watched of WATCHED_PROJECTS) {
    const saved = input.saved.filter((project) =>
      matchesWatchedProject(watched, project.name),
    );
    const pages = input.pages.filter((project) =>
      matchesWatchedProject(watched, project.name),
    );
    const workers = input.workers.filter((worker) =>
      matchesWatchedProject(watched, worker.name),
    );

    for (const project of saved) usedSaved.add(project.id);
    for (const project of pages) usedPages.add(project.name);
    for (const worker of workers) usedWorkers.add(worker.name);

    groups.push(toGroup(watched.name, watched.slug, saved, pages, workers));
  }

  for (const project of input.saved) {
    if (usedSaved.has(project.id)) continue;

    const linkedPages =
      project.cfType === 'pages'
        ? input.pages.filter((candidate) => candidate.name === project.cfName)
        : [];
    const linkedWorkers =
      project.cfType === 'worker'
        ? input.workers.filter((candidate) => candidate.name === project.cfName)
        : [];

    for (const page of linkedPages) usedPages.add(page.name);
    for (const worker of linkedWorkers) usedWorkers.add(worker.name);

    groups.push(
      toGroup(
        project.name,
        slugFromName(project.name),
        [project],
        linkedPages,
        linkedWorkers,
      ),
    );
  }

  for (const project of input.pages) {
    if (usedPages.has(project.name)) continue;
    groups.push(
      toGroup(project.name, slugFromName(project.name), [], [project], []),
    );
  }

  for (const worker of input.workers) {
    if (usedWorkers.has(worker.name)) continue;
    groups.push(
      toGroup(worker.name, slugFromName(worker.name), [], [], [worker]),
    );
  }

  return groups.sort((a, b) => {
    const activityA = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
    const activityB = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;

    return activityB - activityA;
  });
}

export function findDashboardProject(
  slug: string,
  groups: ProjectGroup[],
): ProjectGroup | null {
  return groups.find((group) => group.slug === slug) ?? null;
}

export function resourceUrl(
  project: CloudPagesProject | null,
  worker: CloudWorker | null,
): string | null {
  const domain = project?.domains[0] ?? worker?.domains[0];
  if (domain) return `https://${domain}`;

  if (project?.subdomain) return `https://${project.subdomain}`;

  return null;
}

export function repoHref(repoUrl: string | null, repo: string | null): string {
  if (repoUrl) return repoUrl;
  if (!repo) return '#';
  return repo.startsWith('http') ? repo : `https://github.com/${repo}`;
}

function toGroup(
  name: string,
  slug: string,
  savedProjects: Project[],
  pages: CloudPagesProject[],
  workers: CloudWorker[],
): ProjectGroup {
  return {
    name,
    slug,
    savedProjects,
    pages,
    workers,
    repoUrl: savedProjects.find((project) => project.repoUrl)?.repoUrl ?? null,
    url: resourceUrl(pages[0] ?? null, workers[0] ?? null),
    lastActivity: lastActivity(pages, workers),
  };
}

function matchesWatchedProject(
  target: WatchedProject,
  candidate: string,
): boolean {
  const normalized = normalizeName(candidate);
  const accepted = [target.name, target.slug, ...(target.aliases ?? [])].map(
    normalizeName,
  );

  return accepted.some(
    (name) =>
      normalized === name ||
      normalized.startsWith(name) ||
      normalized.includes(name),
  );
}

function lastActivity(
  pages: CloudPagesProject[],
  workers: CloudWorker[],
): string | null {
  const dates = [
    ...pages.map(
      (project) => project.latestDeployment?.createdOn ?? project.createdOn,
    ),
    ...workers.map((worker) => worker.modifiedOn),
  ]
    .map((date) => new Date(date).getTime())
    .filter(Number.isFinite);

  if (!dates.length) return null;

  return new Date(Math.max(...dates)).toISOString();
}

function slugFromName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}
