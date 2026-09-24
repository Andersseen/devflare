import {
  Component,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { MOVEMENT_DIRECTIVES } from 'angular-movement';
import { LucideAngularModule } from 'lucide-angular';
import {
  VoltButton,
  VoltCard,
  VoltCardContent,
  VoltError,
} from '@voltui/components';
import {
  CloudflareAccount,
  Projects,
  formatRelative,
  type CloudDeployment,
  type CloudPagesProject,
  type Project,
} from '@org/core';
import { CloudGate } from '../cloud/cloud-gate';
import { DeploymentStatus } from '../cloud/deployment-status';
import {
  findDashboardProject,
  groupDashboardProjects,
  repoHref,
  resourceUrls,
} from '../dashboard-projects';

/** Enough to see what shipped recently; full history is on the Pages page. */
const MAX_DEPLOYMENTS = 10;

interface ProjectDeployment {
  pagesProject: string;
  deployment: CloudDeployment;
}

@Component({
  selector: 'app-project-detail-page',
  imports: [
    RouterLink,
    MOVEMENT_DIRECTIVES,
    LucideAngularModule,
    VoltButton,
    VoltCard,
    VoltCardContent,
    VoltError,
    CloudGate,
    DeploymentStatus,
  ],
  template: `
    <div class="space-y-8">
      <a
        routerLink="/"
        class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
      >
        <lucide-icon name="arrow-left" class="h-4 w-4" />
        All projects
      </a>

      <div
        class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"
      >
        <div class="min-w-0">
          <h1 class="truncate text-3xl font-bold tracking-tight">
            {{ group()?.name ?? slug() }}
          </h1>
          <div
            class="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground"
          >
            <span>{{ group()?.workers?.length ?? 0 }} Workers</span>
            <span>{{ group()?.pages?.length ?? 0 }} Pages projects</span>
            @if (group()?.lastActivity; as lastActivity) {
              <span>updated {{ relative(lastActivity) }}</span>
            }
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          @if (group()?.url; as url) {
            <a [href]="url" target="_blank" rel="noreferrer">
              <volt-button size="sm">
                <lucide-icon name="external-link" class="mr-1 h-4 w-4" />
                Open site
              </volt-button>
            </a>
          }
          @if (repository(); as repo) {
            <a [href]="repo" target="_blank" rel="noreferrer">
              <volt-button size="sm" variant="outline">
                <lucide-icon name="github" class="mr-1 h-4 w-4" />
                Repository
              </volt-button>
            </a>
          }
          @if (status()?.configured) {
            <volt-button variant="ghost" size="sm" (click)="reload()">
              <lucide-icon
                name="refresh-cw"
                class="mr-1 h-4 w-4"
                [class.animate-spin]="loading()"
              />
              Reload
            </volt-button>
          }
        </div>
      </div>

      @if (statusError()) {
        <volt-error>{{ statusError() }}</volt-error>
      }
      @if (actionNotice()) {
        <p
          class="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400"
        >
          {{ actionNotice() }}
        </p>
      }
      @if (actionError()) {
        <volt-error>{{ actionError() }}</volt-error>
      }

      <app-cloud-gate [status]="status()">
        @if (cloud.error()) {
          <volt-error>{{ cloud.error() }}</volt-error>
        }
      </app-cloud-gate>

      @if (loading() && !group()) {
        <div class="flex items-center justify-center py-12">
          <lucide-icon
            name="loader"
            class="h-8 w-8 animate-spin text-muted-foreground"
          />
        </div>
      } @else if (group(); as projectGroup) {
        <!-- At a glance: the three questions this page answers first. -->
        <section
          class="grid gap-4 rounded-md border border-border bg-card p-5 md:grid-cols-3"
          aria-label="Overview"
        >
          <div class="min-w-0 space-y-1">
            <p class="text-xs font-medium uppercase text-muted-foreground">
              Live
            </p>
            @for (url of liveUrls(); track url) {
              <a
                [href]="url"
                target="_blank"
                rel="noreferrer"
                class="flex min-w-0 items-center gap-2 text-sm text-primary hover:underline"
              >
                <lucide-icon name="external-link" class="h-4 w-4 shrink-0" />
                <span class="truncate">{{ url }}</span>
              </a>
            } @empty {
              <p class="text-sm text-muted-foreground">No public URL yet.</p>
            }
          </div>

          <div class="min-w-0 space-y-1">
            <p class="text-xs font-medium uppercase text-muted-foreground">
              Repository
            </p>
            @if (repository(); as repo) {
              <a
                [href]="repo"
                target="_blank"
                rel="noreferrer"
                class="flex min-w-0 items-center gap-2 text-sm hover:text-primary hover:underline"
              >
                <lucide-icon name="github" class="h-4 w-4 shrink-0" />
                <span class="truncate">{{ repo }}</span>
              </a>
            } @else {
              <p class="text-sm text-muted-foreground">
                Not linked —
                <a routerLink="/" class="text-primary hover:underline"
                  >add one from Projects</a
                >.
              </p>
            }
          </div>

          <div class="min-w-0 space-y-1">
            <p class="text-xs font-medium uppercase text-muted-foreground">
              Latest deployment
            </p>
            @if (projectGroup.latestDeployment; as latest) {
              <div class="flex flex-wrap items-center gap-2 text-sm">
                <app-deployment-status
                  [status]="latest.deployment.status"
                  [stage]="latest.deployment.stage"
                />
                <span class="text-muted-foreground">
                  {{ relative(latest.deployment.createdOn) }} ·
                  {{ latest.pagesProject }}
                </span>
              </div>
            } @else {
              <p class="text-sm text-muted-foreground">
                Nothing reported by Pages.
              </p>
            }
          </div>
        </section>

        <section class="space-y-4">
          <h2 class="text-lg font-semibold">Resources</h2>

          @if (!projectGroup.pages.length && !projectGroup.workers.length) {
            <p
              class="rounded-md border border-border p-4 text-muted-foreground"
            >
              No Cloudflare Pages project or Worker matched this project yet.
            </p>
          }

          <div class="grid gap-4 lg:grid-cols-2" [moveStagger]="45">
            @for (worker of projectGroup.workers; track worker.name) {
              <volt-card [move]="'fade-up'" moveDuration="260">
                <volt-card-content class="space-y-4 p-5">
                  <div class="min-w-0">
                    <p
                      class="inline-flex items-center gap-1 text-xs font-medium uppercase text-muted-foreground"
                    >
                      <lucide-icon name="zap" class="h-3.5 w-3.5" />
                      Worker
                    </p>
                    <h3 class="truncate text-lg font-semibold">
                      {{ worker.name }}
                    </h3>
                    <p class="mt-1 text-sm text-muted-foreground">
                      updated {{ relative(worker.modifiedOn) }}
                    </p>
                  </div>

                  @for (domain of worker.domains; track domain) {
                    <a
                      [href]="'https://' + domain"
                      target="_blank"
                      rel="noreferrer"
                      class="flex min-w-0 items-center gap-2 text-sm text-primary hover:underline"
                    >
                      <lucide-icon
                        name="external-link"
                        class="h-4 w-4 shrink-0"
                      />
                      <span class="truncate">https://{{ domain }}</span>
                    </a>
                  }

                  <a [routerLink]="['/cloud/workers', worker.name]">
                    <volt-button size="sm" variant="outline">
                      <lucide-icon
                        name="terminal-square"
                        class="mr-1 h-4 w-4"
                      />
                      Versions
                    </volt-button>
                  </a>
                </volt-card-content>
              </volt-card>
            }

            @for (project of projectGroup.pages; track project.name) {
              <volt-card [move]="'fade-up'" moveDuration="260">
                <volt-card-content class="space-y-4 p-5">
                  <div class="min-w-0">
                    <p
                      class="inline-flex items-center gap-1 text-xs font-medium uppercase text-muted-foreground"
                    >
                      <lucide-icon name="globe" class="h-3.5 w-3.5" />
                      Pages
                    </p>
                    <div class="flex min-w-0 items-center gap-2">
                      <h3 class="truncate text-lg font-semibold">
                        {{ project.name }}
                      </h3>
                      @if (project.latestDeployment; as deployment) {
                        <app-deployment-status
                          [status]="deployment.status"
                          [stage]="deployment.stage"
                        />
                      }
                    </div>
                    <p class="mt-1 text-sm text-muted-foreground">
                      updated {{ relative(pageActivity(project)) }} · production
                      branch {{ project.productionBranch }}
                    </p>
                  </div>

                  @for (url of pageUrls(project); track url) {
                    <a
                      [href]="url"
                      target="_blank"
                      rel="noreferrer"
                      class="flex min-w-0 items-center gap-2 text-sm text-primary hover:underline"
                    >
                      <lucide-icon
                        name="external-link"
                        class="h-4 w-4 shrink-0"
                      />
                      <span class="truncate">{{ url }}</span>
                    </a>
                  }

                  <div
                    class="flex flex-wrap items-center justify-between gap-2"
                  >
                    <a [routerLink]="['/cloud/pages', project.name]">
                      <volt-button size="sm" variant="outline">
                        <lucide-icon name="activity" class="mr-1 h-4 w-4" />
                        Deployments &amp; rollback
                      </volt-button>
                    </a>

                    @if (project.gitConnected) {
                      @if (confirmingDeploy() === project.name) {
                        <div class="flex items-center gap-2">
                          <span class="text-sm text-muted-foreground"
                            >Redeploy?</span
                          >
                          <volt-button
                            size="sm"
                            [disabled]="acting() === project.name"
                            (click)="redeploy(project)"
                          >
                            Confirm
                          </volt-button>
                          <volt-button
                            size="sm"
                            variant="ghost"
                            [disabled]="acting() === project.name"
                            (click)="cancelDeploy()"
                          >
                            Cancel
                          </volt-button>
                        </div>
                      } @else {
                        <volt-button
                          size="sm"
                          [disabled]="acting() === project.name"
                          (click)="askDeploy(project.name)"
                        >
                          <lucide-icon
                            name="rocket"
                            class="mr-1 h-4 w-4"
                            [class.animate-pulse]="acting() === project.name"
                          />
                          Redeploy
                        </volt-button>
                      }
                    }
                  </div>
                </volt-card-content>
              </volt-card>
            }
          </div>
        </section>

        @if (projectGroup.pages.length) {
          <section class="space-y-4">
            <div class="flex items-center justify-between gap-3">
              <h2 class="text-lg font-semibold">Deployments</h2>
              <span class="text-sm text-muted-foreground">
                Pages · newest first
              </span>
            </div>

            @if (deploymentsError()) {
              <volt-error>{{ deploymentsError() }}</volt-error>
            }

            @if (deploymentsLoading() && !deployments().length) {
              <div class="flex items-center justify-center py-8">
                <lucide-icon
                  name="loader"
                  class="h-6 w-6 animate-spin text-muted-foreground"
                />
              </div>
            } @else if (deployments().length) {
              <ul
                class="divide-y divide-border rounded-md border border-border bg-card"
              >
                @for (
                  item of deployments();
                  track item.pagesProject + item.deployment.id
                ) {
                  <li
                    class="flex flex-col gap-2 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div class="min-w-0 space-y-1">
                      <div class="flex min-w-0 flex-wrap items-center gap-2">
                        <app-deployment-status
                          [status]="item.deployment.status"
                          [stage]="item.deployment.stage"
                        />
                        <span class="font-medium">{{ item.pagesProject }}</span>
                        <span class="text-muted-foreground">
                          {{ item.deployment.environment }}
                        </span>
                      </div>
                      <p class="truncate text-muted-foreground">
                        @if (item.deployment.branch) {
                          {{ item.deployment.branch }} ·
                        }
                        <span class="font-mono">{{
                          item.deployment.commit?.slice(0, 7) ??
                            item.deployment.shortId
                        }}</span>
                        @if (item.deployment.commitMessage) {
                          · {{ item.deployment.commitMessage }}
                        }
                      </p>
                    </div>
                    <div class="flex shrink-0 items-center gap-3">
                      <span class="text-muted-foreground">
                        {{ relative(item.deployment.createdOn) }}
                      </span>
                      <a
                        [href]="item.deployment.url"
                        target="_blank"
                        rel="noreferrer"
                        class="text-primary hover:underline"
                        >Preview</a
                      >
                    </div>
                  </li>
                }
              </ul>
            } @else if (!deploymentsLoading()) {
              <p
                class="rounded-md border border-border p-4 text-muted-foreground"
              >
                No deployments reported yet.
              </p>
            }
          </section>
        }
      } @else {
        <volt-card>
          <volt-card-content class="p-6">
            <p class="text-muted-foreground">Project not found.</p>
          </volt-card-content>
        </volt-card>
      }
    </div>
  `,
})
export default class ProjectDetailPage {
  protected readonly slug = input.required<string>();
  protected readonly cloud = inject(CloudflareAccount);
  readonly #projectsService = inject(Projects);

  protected readonly projects = signal<Project[]>([]);
  protected readonly isLoadingProjects = signal(true);
  protected readonly statusError = signal('');
  protected readonly actionError = signal('');
  protected readonly actionNotice = signal('');
  protected readonly confirmingDeploy = signal('');
  protected readonly acting = signal('');

  protected readonly status = this.cloud.status;
  protected readonly relative = formatRelative;
  protected readonly repoHref = repoHref;
  protected readonly loading = computed(
    () => this.cloud.loading() || this.isLoadingProjects(),
  );

  protected readonly groups = computed(() =>
    groupDashboardProjects({
      saved: this.projects(),
      pages: this.cloud.projects(),
      workers: this.cloud.workers(),
    }),
  );

  protected readonly group = computed(() =>
    findDashboardProject(this.slug(), this.groups()),
  );

  protected readonly repository = computed(() => {
    const group = this.group();
    if (!group) return null;
    const repo = group.pages.find((project) => project.repo)?.repo ?? null;
    return group.repoUrl || repo ? repoHref(group.repoUrl, repo) : null;
  });

  /** Every public URL, custom domains ahead of generated fallbacks. */
  protected readonly liveUrls = computed(() => {
    const group = this.group();
    if (!group) return [];
    return [
      ...new Set([
        ...(group.url ? [group.url] : []),
        ...group.verifiedUrls,
        ...group.pages.flatMap((project) => resourceUrls(project, null)),
        ...group.workers.flatMap((worker) => resourceUrls(null, worker)),
      ]),
    ];
  });

  protected readonly deployments = signal<ProjectDeployment[]>([]);
  protected readonly deploymentsLoading = signal(false);
  protected readonly deploymentsError = signal('');

  constructor() {
    afterNextRender(() => {
      if (typeof window !== 'undefined') void this.load();
    });
  }

  protected async reload(): Promise<void> {
    await this.load(true);
  }

  protected pageUrls(project: CloudPagesProject): string[] {
    return resourceUrls(project, null);
  }

  protected pageActivity(project: CloudPagesProject): string {
    return project.latestDeployment?.createdOn ?? project.createdOn;
  }

  protected askDeploy(name: string): void {
    this.confirmingDeploy.set(name);
    this.actionError.set('');
    this.actionNotice.set('');
  }

  protected cancelDeploy(): void {
    this.confirmingDeploy.set('');
  }

  protected async redeploy(project: CloudPagesProject): Promise<void> {
    this.acting.set(project.name);
    this.actionError.set('');
    this.actionNotice.set('');

    try {
      await this.cloud.deployPages(project.name);
      this.actionNotice.set(
        `Redeploy started for ${project.name}. Cloudflare will update the latest deployment shortly.`,
      );
      this.confirmingDeploy.set('');
      await this.cloud.loadOverview(true);
      await this.loadDeployments(true);
    } catch (error: unknown) {
      this.actionError.set(
        error instanceof Error ? error.message : 'Could not start redeploy',
      );
    } finally {
      this.acting.set('');
    }
  }

  private async load(refresh = false): Promise<void> {
    this.isLoadingProjects.set(true);
    this.statusError.set('');

    const projectList = this.#projectsService
      .getProjects()
      .then((projects) => this.projects.set(projects))
      .catch((error: unknown) => {
        console.error('Failed to load projects', error);
        this.projects.set([]);
      })
      .finally(() => this.isLoadingProjects.set(false));

    try {
      const status = await this.cloud.loadStatus();
      if (status.admin && status.configured) {
        await this.cloud.loadOverview(refresh);
      }
    } catch (error: unknown) {
      this.statusError.set(
        error instanceof Error ? error.message : 'Could not reach the server',
      );
      console.error('Failed to load project detail', error);
    }

    await projectList;
    await this.loadDeployments(refresh);
  }

  /**
   * History comes from the same per-project endpoint the Cloud Pages page
   * uses; this only merges it across the Pages projects in this group.
   */
  private async loadDeployments(refresh: boolean): Promise<void> {
    const pages = this.group()?.pages ?? [];
    if (!pages.length) {
      this.deployments.set([]);
      return;
    }

    this.deploymentsLoading.set(true);
    this.deploymentsError.set('');

    try {
      const details = await Promise.all(
        pages.map((project) =>
          this.cloud.loadPagesProject(project.name, refresh),
        ),
      );
      this.deployments.set(
        details
          .flatMap((detail) =>
            detail.deployments.map((deployment) => ({
              pagesProject: detail.project.name,
              deployment,
            })),
          )
          .sort(
            (a, b) =>
              new Date(b.deployment.createdOn).getTime() -
              new Date(a.deployment.createdOn).getTime(),
          )
          .slice(0, MAX_DEPLOYMENTS),
      );
    } catch (error: unknown) {
      this.deploymentsError.set(
        error instanceof Error ? error.message : 'Could not load deployments',
      );
    } finally {
      this.deploymentsLoading.set(false);
    }
  }
}
