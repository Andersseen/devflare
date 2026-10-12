import type {
  CloudDeployment,
  CloudPagesProject,
  CloudResourceRef,
  CloudWorker,
  Project,
  ResolvedResource,
} from '@org/core';

export interface WatchedProject {
  name: string;
  slug: string;
  aliases?: readonly string[];
  /**
   * Public domains verified in production but not returned by the current
   * Cloudflare Pages/Workers-domain permissions (for example Worker routes).
   */
  verifiedDomains?: readonly string[];
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
