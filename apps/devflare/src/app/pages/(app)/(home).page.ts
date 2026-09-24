import {
  Component,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MOVEMENT_DIRECTIVES } from 'angular-movement';
import { LucideAngularModule } from 'lucide-angular';
import {
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
  ProjectHub,
  Projects,
  countLabel,
  formatRelative,
  resourceCounts,
} from '@org/core';
import { CloudGate } from './cloud/cloud-gate';
import { DeploymentStatus } from './cloud/deployment-status';
import {
  buildProjectViews,
  repoLabel,
  slugFromName,
  unresolvedCount,
  type ProjectView,
} from './dashboard-projects';

/**
 * Projects — where DevFlare starts (spec 019).
 *
 * Saved projects first: what each owns is its explicit resource links, counted
 * on the card. Below them, Workers and Pages nobody owns yet, grouped by name —
 * suggestions to save, never presented as ownership.
 */
@Component({
  selector: 'app-projects-page',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    MOVEMENT_DIRECTIVES,
    LucideAngularModule,
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
    <div class="space-y-8">
      <div
        class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"
      >
        <div>
          <h1 class="text-3xl font-bold tracking-tight">Projects</h1>
          <p class="mt-1 text-muted-foreground">
            Your applications — what they own, where they run, and what shipped
            last.
          </p>
          <p class="mt-2 text-sm text-muted-foreground">
            {{ views().projects.length }}
            {{ views().projects.length === 1 ? 'project' : 'projects' }} ·
            {{ liveCount() }} live
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
          <volt-button variant="outline" size="sm" (click)="reload()">
            <lucide-icon
              name="refresh-cw"
              class="mr-1 h-4 w-4"
              [class.animate-spin]="hub.loading()"
            />
            Reload
          </volt-button>
        </div>
      </div>

      @if (hub.error()) {
        <volt-error>{{ hub.error() }}</volt-error>
      }

      <!-- Creating a project asks for nothing about infrastructure. -->
      <details
        class="group rounded-md border border-border bg-card"
        [open]="creating()"
        (toggle)="onToggle($event)"
      >
        <summary
          class="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-medium"
        >
          <span class="inline-flex items-center gap-2">
            <lucide-icon name="plus" class="h-4 w-4" />
            New project
          </span>
          <lucide-icon
            name="chevron-right"
            class="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90"
          />
        </summary>
        <div class="space-y-4 border-t border-border p-4">
          <p class="text-sm text-muted-foreground">
            A name is enough. Link Workers, Pages, databases and buckets from
            the project page afterwards.
          </p>
          <form
            class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto]"
            (submit)="onCreate($event)"
          >
            <volt-form-field>
              <volt-label>Name</volt-label>
              <volt-input
                type="text"
                placeholder="Ally"
                [(value)]="newName"
                autocomplete="off"
                aria-label="Project name"
              />
            </volt-form-field>
            <volt-form-field>
              <volt-label>Repository URL (optional)</volt-label>
              <volt-input
                type="text"
                placeholder="github.com/andersseen/ally"
                [(value)]="newRepoUrl"
                autocomplete="off"
                aria-label="Repository URL"
              />
            </volt-form-field>
            <div class="flex items-end">
              <volt-button
                type="submit"
                variant="solid"
                [disabled]="isCreating() || !newName().trim()"
              >
                @if (isCreating()) {
                  <lucide-icon
                    name="loader"
                    class="mr-1 h-4 w-4 animate-spin"
                  />
                  Creating
                } @else {
                  <lucide-icon name="plus" class="mr-1 h-4 w-4" />
                  Create project
                }
              </volt-button>
            </div>
          </form>
          @if (createError()) {
            <volt-error>{{ createError() }}</volt-error>
          }
        </div>
      </details>

      @if (hub.loading() && !hub.projects()) {
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
          @for (view of views().projects; track view.slug) {
            <ng-container
              *ngTemplateOutlet="card; context: { $implicit: view }"
            />
          } @empty {
            <p
              class="rounded-md border border-border p-6 text-muted-foreground md:col-span-2 2xl:col-span-3"
            >
              No projects yet. Create one above, or save one of the projects
              discovered in your Cloudflare account below.
            </p>
          }
        </section>
      }

      @if (hub.unavailable() && hasLinks()) {
        <p
          class="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground"
        >
          <lucide-icon name="lock" class="mt-0.5 h-4 w-4 shrink-0" />
          Resource states cannot be verified: {{ hub.unavailable() }}.
        </p>
      }

      <section class="space-y-4" aria-labelledby="discovered-heading">
        <div>
          <h2 id="discovered-heading" class="text-lg font-semibold">
            Discovered in Cloudflare
          </h2>
          <p class="text-sm text-muted-foreground">
            Workers and Pages no project owns yet, grouped by name. Nothing here
            is saved — open one to save it as a project.
          </p>
        </div>

        <app-cloud-gate [status]="hub.status()">
          @if (views().discovered.length) {
            <div
              class="grid gap-4 md:grid-cols-2 2xl:grid-cols-3"
              [moveStagger]="45"
            >
              @for (view of views().discovered; track view.slug) {
                <ng-container
                  *ngTemplateOutlet="card; context: { $implicit: view }"
                />
              }
            </div>
          } @else if (!hub.loading()) {
            <p
              class="rounded-md border border-border p-4 text-muted-foreground"
            >
              Every Worker and Pages project belongs to a project.
            </p>
          }
        </app-cloud-gate>
      </section>
    </div>

    <ng-template #card let-view>
      <a
        [routerLink]="['/projects', view.slug]"
        [move]="'fade-up'"
        moveDuration="260"
        class="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        [attr.data-testid]="
          view.kind === 'saved' ? 'project-card' : 'discovered-card'
        "
      >
        <volt-card class="h-full transition-colors hover:border-primary/60">
          <volt-card-content class="flex h-full flex-col gap-4 p-5">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 space-y-1">
                <div class="flex min-w-0 items-center gap-2">
                  <h2 class="truncate text-lg font-semibold">
                    {{ view.name }}
                  </h2>
                  @if (view.kind === 'discovered') {
                    <span
                      class="shrink-0 rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground"
                      >Not saved</span
                    >
                  }
                </div>
                <div
                  class="space-y-0.5 text-sm text-muted-foreground"
                  data-testid="resource-counts"
                >
                  @for (line of countLines(view); track $index) {
                    <p>{{ line }}</p>
                  } @empty {
                    <p>No resources linked</p>
                  }
                </div>
                @if (unresolved(view); as count) {
                  <p
                    class="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400"
                  >
                    <lucide-icon name="alert-circle" class="h-3.5 w-3.5" />
                    {{ count }}
                    {{ count === 1 ? 'resource needs' : 'resources need' }}
                    attention
                  </p>
                }
              </div>
              <lucide-icon
                name="chevron-right"
                class="h-5 w-5 shrink-0 text-muted-foreground"
              />
            </div>

            <div class="space-y-2 text-sm">
              @if (view.url) {
                <span class="flex min-w-0 items-center gap-2 text-primary">
                  <lucide-icon name="external-link" class="h-4 w-4 shrink-0" />
                  <span class="truncate">{{ view.url }}</span>
                </span>
              }
              @if (view.repoUrl) {
                <span
                  class="flex min-w-0 items-center gap-2 text-muted-foreground"
                >
                  <lucide-icon name="github" class="h-4 w-4 shrink-0" />
                  <span class="truncate">{{ repo(view.repoUrl) }}</span>
                </span>
              }
            </div>

            <div
              class="mt-auto flex min-w-0 flex-wrap items-center gap-2 border-t border-border pt-3 text-sm text-muted-foreground"
            >
              @if (view.latestDeployment; as latest) {
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
              } @else if (view.lastActivity) {
                <span>latest activity {{ relative(view.lastActivity) }}</span>
              } @else {
                <span>No activity reported</span>
              }
            </div>
          </volt-card-content>
        </volt-card>
      </a>
    </ng-template>
  `,
})
export default class ProjectsPage {
  protected readonly hub = inject(ProjectHub);
  readonly #cloud = inject(CloudflareAccount);
  readonly #projects = inject(Projects);
  readonly #router = inject(Router);

  protected readonly newName = signal('');
  protected readonly newRepoUrl = signal('');
  protected readonly creating = signal(false);
  protected readonly isCreating = signal(false);
  protected readonly createError = signal('');

  protected readonly relative = formatRelative;
  protected readonly repo = repoLabel;
  protected readonly unresolved = unresolvedCount;

  protected readonly views = computed(() =>
    buildProjectViews({
      saved: this.hub.projects() ?? [],
      inventory: this.hub.inventory(),
      unavailable: this.hub.unavailable() ?? undefined,
    }),
  );

  protected readonly liveCount = computed(
    () => this.views().projects.filter((view) => view.url).length,
  );

  protected readonly hasLinks = computed(() =>
    (this.hub.projects() ?? []).some((project) => project.resources.length),
  );

  protected readonly connectedAccount = computed(
    () => this.hub.status()?.connection.accountName ?? null,
  );

  protected readonly canConnect = computed(() => {
    const state = this.hub.status();
    return Boolean(state?.canConnect) && state?.connection.kind !== 'oauth';
  });

  constructor() {
    afterNextRender(() => {
      if (typeof window !== 'undefined') void this.hub.load();
    });
  }

  protected connect(): void {
    window.location.href = this.#cloud.connectUrl;
  }

  protected async reload(): Promise<void> {
    await this.hub.load(true);
  }

  protected onToggle(event: Event): void {
    this.creating.set((event.target as HTMLDetailsElement).open);
  }

  /** "2 Workers · 1 Pages" then "1 D1 · 2 R2": compute/web, then storage. */
  protected countLines(view: ProjectView): string[] {
    const counts = resourceCounts(view.resources);
    return [
      counts.filter((entry) => entry.group !== 'storage'),
      counts.filter((entry) => entry.group === 'storage'),
    ]
      .filter((line) => line.length)
      .map((line) =>
        line.map((entry) => countLabel(entry.type, entry.count)).join(' · '),
      );
  }

  protected async onCreate(event: Event): Promise<void> {
    event.preventDefault();
    this.isCreating.set(true);
    this.createError.set('');

    try {
      const project = await this.#projects.createProject(
        this.newName().trim(),
        this.newRepoUrl().trim() || undefined,
      );
      this.newName.set('');
      this.newRepoUrl.set('');
      this.creating.set(false);

      // Straight to the new project, where its resources get linked. The slug
      // is recomputed from the refreshed list, so a duplicate name still lands
      // on the right one.
      const view = this.views().projects.find(
        (candidate) => candidate.project?.id === project.id,
      );
      await this.#router.navigate([
        '/projects',
        view?.slug ?? slugFromName(project.name),
      ]);
    } catch (error: unknown) {
      this.createError.set(
        error instanceof Error ? error.message : 'Could not create the project',
      );
    } finally {
      this.isCreating.set(false);
    }
  }
}
