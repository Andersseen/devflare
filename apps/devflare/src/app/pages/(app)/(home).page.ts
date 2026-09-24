import {
  Component,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { MOVEMENT_DIRECTIVES } from 'angular-movement';
import { LucideAngularModule } from 'lucide-angular';
import {
  VoltBadge,
  VoltButton,
  VoltCard,
  VoltCardContent,
  VoltError,
  VoltFormField,
  VoltInput,
  VoltLabel,
} from '@voltui/components';
import {
  CloudflareAccount,
  Projects,
  formatRelative,
  type Project,
} from '@org/core';
import { CloudGate } from './cloud/cloud-gate';
import { DeploymentStatus } from './cloud/deployment-status';
import {
  groupDashboardProjects,
  type ProjectGroup,
} from './dashboard-projects';

@Component({
  selector: 'app-projects-page',
  imports: [
    RouterLink,
    MOVEMENT_DIRECTIVES,
    LucideAngularModule,
    VoltBadge,
    VoltButton,
    VoltCard,
    VoltCardContent,
    VoltError,
    VoltFormField,
    VoltInput,
    VoltLabel,
    CloudGate,
    DeploymentStatus,
  ],
  template: `
    <div class="space-y-6">
      <div
        class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"
      >
        <div>
          <h1 class="text-3xl font-bold tracking-tight">Projects</h1>
          <p class="mt-1 text-muted-foreground">
            Your applications — where they run, where the code lives, and what
            shipped last.
          </p>
          <p class="mt-2 text-sm text-muted-foreground">
            {{ groups().length }} projects · {{ liveCount() }} live
            @if (connectedAccount(); as account) {
              · on {{ account }}
            }
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          @if (canConnect()) {
            <volt-button variant="outline" size="sm" (click)="connect()">
              <lucide-icon name="cloud" class="mr-1 h-4 w-4" />
              Connect
            </volt-button>
          }
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

      <app-cloud-gate [status]="status()">
        @if (cloud.error()) {
          <volt-error>{{ cloud.error() }}</volt-error>
        }
      </app-cloud-gate>

      @if (loading() && !groups().some(groupHasCloudResource)) {
        <div class="flex items-center justify-center py-12">
          <lucide-icon
            name="loader"
            class="h-8 w-8 animate-spin text-muted-foreground"
          />
        </div>
      } @else {
        <section
          class="grid gap-4 md:grid-cols-2 2xl:grid-cols-3"
          aria-label="Projects"
          [moveStagger]="45"
        >
          @for (group of groups(); track group.slug) {
            <a
              [routerLink]="['/projects', group.slug]"
              [move]="'fade-up'"
              moveDuration="260"
              class="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <volt-card
                class="h-full transition-colors hover:border-primary/60"
              >
                <volt-card-content class="flex h-full flex-col gap-4 p-5">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <h2 class="truncate text-lg font-semibold">
                        {{ group.name }}
                      </h2>
                      <div
                        class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground"
                      >
                        @if (group.workers.length) {
                          <span class="inline-flex items-center gap-1">
                            <lucide-icon name="zap" class="h-3.5 w-3.5" />
                            {{ group.workers.length }}
                            {{
                              group.workers.length === 1 ? 'Worker' : 'Workers'
                            }}
                          </span>
                        }
                        @if (group.pages.length) {
                          <span class="inline-flex items-center gap-1">
                            <lucide-icon name="globe" class="h-3.5 w-3.5" />
                            {{ group.pages.length }} Pages
                            {{
                              group.pages.length === 1 ? 'project' : 'projects'
                            }}
                          </span>
                        }
                        @if (!group.pages.length && !group.workers.length) {
                          <volt-badge variant="secondary">
                            {{ group.url ? 'live' : 'planned' }}
                          </volt-badge>
                        }
                      </div>
                    </div>
                    <lucide-icon
                      name="chevron-right"
                      class="h-5 w-5 shrink-0 text-muted-foreground"
                    />
                  </div>

                  <div class="space-y-2 text-sm">
                    @if (group.url) {
                      <span
                        class="flex min-w-0 items-center gap-2 text-primary"
                      >
                        <lucide-icon
                          name="external-link"
                          class="h-4 w-4 shrink-0"
                        />
                        <span class="truncate">{{ group.url }}</span>
                      </span>
                    } @else {
                      <p class="text-muted-foreground">
                        No public URL found yet.
                      </p>
                    }

                    @if (repoLabel(group); as label) {
                      <span
                        class="flex min-w-0 items-center gap-2 text-muted-foreground"
                      >
                        <lucide-icon name="github" class="h-4 w-4 shrink-0" />
                        <span class="truncate">{{ label }}</span>
                      </span>
                    }
                  </div>

                  <div
                    class="mt-auto flex min-w-0 flex-wrap items-center gap-2 border-t border-border pt-3 text-sm text-muted-foreground"
                  >
                    @if (group.latestDeployment; as latest) {
                      <app-deployment-status
                        [status]="latest.deployment.status"
                        [stage]="latest.deployment.stage"
                      />
                      <span class="min-w-0 truncate">
                        deployed {{ relative(latest.deployment.createdOn) }}
                        @if (latest.deployment.branch) {
                          from {{ latest.deployment.branch }}
                        }
                      </span>
                    } @else if (group.lastActivity) {
                      <span>updated {{ relative(group.lastActivity) }}</span>
                    } @else {
                      <span>No deployment activity reported</span>
                    }
                  </div>
                </volt-card-content>
              </volt-card>
            </a>
          } @empty {
            @if (!loading()) {
              <p
                class="rounded-md border border-border p-6 text-muted-foreground md:col-span-2 2xl:col-span-3"
              >
                No projects yet. Connect Cloudflare, or link a repository to a
                Pages project or Worker below.
              </p>
            }
          }
        </section>
      }

      <!--
        Secondary: most projects are found from Cloudflare on their own. This
        only adds a repository link or ties a name to a specific resource.
      -->
      <details class="group rounded-md border border-border bg-card">
        <summary
          class="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-medium"
        >
          <span class="inline-flex items-center gap-2">
            <lucide-icon name="plus" class="h-4 w-4" />
            Link a repository or resource to a project
          </span>
          <lucide-icon
            name="chevron-right"
            class="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90"
          />
        </summary>
        <div class="space-y-4 border-t border-border p-4">
          <p class="text-sm text-muted-foreground">
            Save a GitHub URL, or tie a project name to a specific Pages project
            or Worker when its name does not match on its own.
          </p>
          <form
            class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)_auto]"
            (submit)="onCreate($event)"
          >
            <volt-form-field>
              <volt-label>Project</volt-label>
              <volt-input
                type="text"
                placeholder="lumen-icons"
                [(value)]="newName"
                autocomplete="off"
              />
            </volt-form-field>
            <volt-form-field>
              <volt-label>Repository URL</volt-label>
              <volt-input
                type="url"
                placeholder="https://github.com/andriipap/lumen-icons"
                [(value)]="newRepoUrl"
                autocomplete="off"
              />
            </volt-form-field>
            <div class="space-y-2">
              <label for="cloud-resource" class="text-sm font-medium">
                Cloudflare resource
              </label>
              <select
                id="cloud-resource"
                class="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                [value]="newCloudLink()"
                (change)="onNewLinkChange($event)"
              >
                <option value="">Not linked</option>
                @for (option of linkOptions(); track option.value) {
                  <option [value]="option.value">{{ option.label }}</option>
                }
              </select>
            </div>
            <div class="flex items-end">
              <volt-button
                type="submit"
                variant="solid"
                [disabled]="isCreating() || !newName()"
              >
                @if (isCreating()) {
                  <lucide-icon
                    name="loader"
                    class="mr-1 h-4 w-4 animate-spin"
                  />
                  Saving
                } @else {
                  <lucide-icon name="plus" class="mr-1 h-4 w-4" />
                  Save
                }
              </volt-button>
            </div>
          </form>
          @if (createError()) {
            <volt-error>{{ createError() }}</volt-error>
          }
        </div>
      </details>
    </div>
  `,
})
export default class ProjectsPage {
  protected readonly cloud = inject(CloudflareAccount);
  readonly #projectsService = inject(Projects);

  protected readonly projects = signal<Project[]>([]);
  protected readonly isLoadingProjects = signal(true);
  protected readonly newName = signal('');
  protected readonly newRepoUrl = signal('');
  protected readonly newCloudLink = signal('');
  protected readonly isCreating = signal(false);
  protected readonly createError = signal('');
  protected readonly statusError = signal('');

  protected readonly status = this.cloud.status;
  protected readonly loading = computed(
    () => this.cloud.loading() || this.isLoadingProjects(),
  );
  protected readonly relative = formatRelative;
  protected readonly groupHasCloudResource = (group: ProjectGroup) =>
    Boolean(group.pages.length || group.workers.length || group.url);

  protected readonly connectedAccount = computed(
    () => this.status()?.connection.accountName ?? null,
  );

  protected readonly canConnect = computed(() => {
    const state = this.status();
    return Boolean(state?.canConnect) && state?.connection.kind !== 'oauth';
  });

  protected readonly linkOptions = computed(() => [
    ...this.cloud.projects().map((project) => ({
      value: `pages:${project.name}`,
      label: `Pages · ${project.name}`,
    })),
    ...this.cloud.workers().map((worker) => ({
      value: `worker:${worker.name}`,
      label: `Worker · ${worker.name}`,
    })),
  ]);

  protected readonly groups = computed(() =>
    groupDashboardProjects({
      saved: this.projects(),
      pages: this.cloud.projects(),
      workers: this.cloud.workers(),
    }),
  );

  protected readonly liveCount = computed(
    () => this.groups().filter((group) => group.url).length,
  );

  constructor() {
    afterNextRender(() => {
      if (typeof window !== 'undefined') void this.load();
    });
  }

  protected connect(): void {
    window.location.href = this.cloud.connectUrl;
  }

  protected async reload(): Promise<void> {
    await this.load(true);
  }

  protected repoLabel(group: ProjectGroup): string | null {
    return (
      group.repoUrl ?? group.pages.find((project) => project.repo)?.repo ?? null
    );
  }

  protected onNewLinkChange(event: Event): void {
    this.newCloudLink.set((event.target as HTMLSelectElement).value);
  }

  protected async onCreate(event: Event): Promise<void> {
    event.preventDefault();
    this.isCreating.set(true);
    this.createError.set('');

    try {
      const project = await this.#projectsService.createProject(
        this.newName(),
        this.newRepoUrl() || undefined,
      );

      const link = this.parseLink(this.newCloudLink());
      const saved = link
        ? await this.#projectsService.linkProject(project.id, link)
        : project;

      this.projects.update((list) => [saved, ...list]);
      this.newName.set('');
      this.newRepoUrl.set('');
      this.newCloudLink.set('');
    } catch (error: unknown) {
      this.createError.set(
        error instanceof Error ? error.message : 'Failed to save project',
      );
    } finally {
      this.isCreating.set(false);
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
      console.error('Failed to load Cloudflare dashboard', error);
    }

    await projectList;
  }

  private parseLink(
    value: string,
  ): { cfType: 'worker' | 'pages'; cfName: string } | null {
    if (!value) return null;

    const [cfType, ...rest] = value.split(':');
    if (cfType !== 'worker' && cfType !== 'pages') return null;

    return { cfType, cfName: rest.join(':') };
  }
}
