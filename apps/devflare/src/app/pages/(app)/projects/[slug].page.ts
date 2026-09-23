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
    <div class="space-y-6">
      <a
        routerLink="/"
        class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
      >
        <lucide-icon name="arrow-left" class="h-4 w-4" />
        Back to dashboard
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
            <span>{{ group()?.pages?.length ?? 0 }} Pages</span>
            <span>{{ group()?.workers?.length ?? 0 }} Workers</span>
            @if (group()?.lastActivity; as lastActivity) {
              <span>updated {{ relative(lastActivity) }}</span>
            }
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          @if (status()?.configured) {
            <volt-button variant="outline" size="sm" (click)="reload()">
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
        @if (projectGroup.verifiedUrls.length) {
          <section class="space-y-3">
            <h2 class="text-lg font-semibold">Public URLs</h2>
            <div class="flex flex-col gap-2">
              @for (url of projectGroup.verifiedUrls; track url) {
                <a
                  [href]="url"
                  target="_blank"
                  rel="noreferrer"
                  class="flex min-w-0 items-center gap-2 text-sm text-primary hover:underline"
                >
                  <lucide-icon name="external-link" class="h-4 w-4 shrink-0" />
                  <span class="truncate">{{ url }}</span>
                </a>
              }
            </div>
          </section>
        }

        <section class="space-y-4">
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-lg font-semibold">Pages</h2>
            <span class="text-sm text-muted-foreground">
              {{ projectGroup.pages.length }} total
            </span>
          </div>

          @if (projectGroup.pages.length) {
            <div class="grid gap-4 lg:grid-cols-2" [moveStagger]="45">
              @for (project of projectGroup.pages; track project.name) {
                <volt-card [move]="'fade-up'" moveDuration="260">
                  <volt-card-content class="space-y-4 p-5">
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
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
                          updated {{ relative(pageActivity(project)) }}
                        </p>
                      </div>
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

                    @if (project.repo) {
                      <a
                        [href]="repoHref(null, project.repo)"
                        target="_blank"
                        rel="noreferrer"
                        class="flex min-w-0 items-center gap-2 text-sm text-muted-foreground hover:text-primary hover:underline"
                      >
                        <lucide-icon name="github" class="h-4 w-4 shrink-0" />
                        <span class="truncate">{{ project.repo }}</span>
                      </a>
                    }

                    @if (project.latestDeployment; as deployment) {
                      <div
                        class="grid grid-cols-2 gap-3 rounded-md border border-border bg-muted/30 p-3 text-sm"
                      >
                        <div class="min-w-0">
                          <p class="text-xs text-muted-foreground">Branch</p>
                          <p class="truncate font-medium">
                            {{ deployment.branch ?? project.productionBranch }}
                          </p>
                        </div>
                        <div class="min-w-0">
                          <p class="text-xs text-muted-foreground">Commit</p>
                          <p class="truncate font-mono">
                            {{
                              deployment.commit?.slice(0, 7) ??
                                deployment.shortId
                            }}
                          </p>
                        </div>
                      </div>
                    }

                    <div
                      class="flex flex-wrap items-center justify-between gap-2"
                    >
                      <a [routerLink]="['/cloud/pages', project.name]">
                        <volt-button size="sm" variant="outline">
                          <lucide-icon name="activity" class="mr-1 h-4 w-4" />
                          Details
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
          } @else {
            <p
              class="rounded-md border border-border p-4 text-muted-foreground"
            >
              No Pages projects matched this project yet.
            </p>
          }
        </section>

        <section class="space-y-4">
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-lg font-semibold">Workers</h2>
            <span class="text-sm text-muted-foreground">
              {{ projectGroup.workers.length }} total
            </span>
          </div>

          @if (projectGroup.workers.length) {
            <div class="grid gap-4 lg:grid-cols-2" [moveStagger]="45">
              @for (worker of projectGroup.workers; track worker.name) {
                <volt-card [move]="'fade-up'" moveDuration="260">
                  <volt-card-content class="space-y-4 p-5">
                    <div class="min-w-0">
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
                        Worker
                      </volt-button>
                    </a>
                  </volt-card-content>
                </volt-card>
              }
            </div>
          } @else {
            <p
              class="rounded-md border border-border p-4 text-muted-foreground"
            >
              No Workers matched this project yet.
            </p>
          }
        </section>
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
  }
}
