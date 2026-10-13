import {
  Component,
  afterNextRender,
  computed,
  effect,
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
  DashboardBoard,
  LayoutEditor,
  type DashboardLayout,
} from '@org/dashboard-layout';
import {
  CloudflareAccount,
  DashboardCustomization,
  ProjectHub,
  Projects,
  countLabel,
  formatRelative,
  resourceCounts,
} from '@org/core';
import { CloudGate } from './cloud/cloud-gate';
import { WATCHED_PROJECTS } from './dashboard-projects.data';
import {
  diffIdentities,
  effectiveIdentities,
  newIdentitySlug,
  parseAliasList,
  isMatchable,
  type Identity,
} from './dashboard-projects.identities';
import { DeploymentStatus } from './cloud/deployment-status';
import {
  buildProjectViews,
  repoLabel,
  slugFromName,
  unresolvedCount,
} from './dashboard-projects';
import type { ProjectView } from './dashboard-projects.models';

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
    DashboardBoard,
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

        <div class="flex flex-wrap items-center gap-2" data-testid="toolbar">
          @if (editor.editing()) {
            <volt-button
              variant="solid"
              size="sm"
              [disabled]="editor.saving()"
              (click)="saveEdit()"
              data-testid="save-layout"
            >
              @if (editor.saving()) {
                <lucide-icon name="loader" class="mr-1 h-4 w-4 animate-spin" />
              }
              Save layout
            </volt-button>
            <volt-button
              variant="outline"
              size="sm"
              [disabled]="editor.saving()"
              (click)="cancelEdit()"
              data-testid="cancel-layout"
            >
              Cancel
            </volt-button>
            <volt-button
              variant="outline"
              size="sm"
              [disabled]="editor.saving()"
              (click)="resetLayout()"
              data-testid="reset-layout"
            >
              {{
                confirmingReset()
                  ? 'Confirm: restore default'
                  : 'Restore default layout'
              }}
            </volt-button>
          } @else if (views().projects.length || views().discovered.length) {
            <volt-button
              variant="outline"
              size="sm"
              (click)="startEdit()"
              data-testid="edit-dashboard"
            >
              <lucide-icon name="pencil" class="mr-1 h-4 w-4" />
              Edit dashboard
            </volt-button>
          }
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
      @if (editor.error()) {
        <volt-error>{{ editor.error() }}</volt-error>
      }
      @if (notice()) {
        <p
          class="rounded-md border border-border bg-muted/40 p-3 text-sm"
          role="status"
          data-testid="notice"
        >
          {{ notice() }}
        </p>
      }
      @if (editor.editing()) {
        <p class="text-sm text-muted-foreground" data-testid="edit-hint">
          Editing the dashboard. Drag a card by its grip, or use the arrows,
          “Move to group” and Hide on each card. This only changes how cards are
          arranged — it never changes which Cloudflare resources a project owns.
          Nothing is saved until you choose Save layout.
        </p>
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
        @if (views().projects.length) {
          <dash-board
            aria-label="Projects"
            [layout]="editor.layout()"
            [editing]="editor.editing()"
            [itemTemplate]="savedCard"
            [labelOf]="savedLabel"
            [hiddenLabelOf]="anyLabel"
            (layoutChange)="editor.apply(setLayout($event))"
          />
        } @else {
          <p class="rounded-md border border-border p-6 text-muted-foreground">
            No projects yet. Create one above, or save one of the projects
            discovered in your Cloudflare account below.
          </p>
        }
      }

      @if (hub.unavailable() && hasLinks()) {
        <p
          class="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground"
        >
          <lucide-icon name="lock" class="mt-0.5 h-4 w-4 shrink-0" />
          Resource states cannot be verified: {{ hub.unavailable() }}.
        </p>
      }

      @if (editor.editing()) {
        <details
          class="rounded-md border border-border bg-card"
          data-testid="identities-panel"
        >
          <summary class="cursor-pointer p-4 text-sm font-medium">
            Discovery groups ({{ identityDraft()?.length ?? 0 }})
          </summary>
          <div class="space-y-4 border-t border-border p-4">
            <p class="text-sm text-muted-foreground">
              Discovery groups suggest which unowned Workers and Pages belong
              together, by name or alias. They are suggestions only — nothing
              here links a resource to a project. Domains shown as verified come
              from the built-in groups and cannot be added by hand.
            </p>
            <ul class="space-y-3">
              @for (identity of identityDraft(); track identity.slug) {
                <li
                  class="grid gap-2 rounded-md border border-border p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]"
                  [attr.data-identity]="identity.slug"
                >
                  <label class="text-xs text-muted-foreground">
                    Name
                    <input
                      class="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
                      [value]="identity.name"
                      maxlength="60"
                      (change)="renameIdentity(identity.slug, $event)"
                    />
                  </label>
                  <label class="text-xs text-muted-foreground">
                    Aliases (comma separated)
                    <input
                      class="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
                      [value]="identity.aliases.join(', ')"
                      data-testid="identity-aliases"
                      (change)="setAliases(identity.slug, $event)"
                    />
                    @if (shortAliases(identity); as short) {
                      <span
                        class="mt-1 block text-amber-700 dark:text-amber-400"
                        >{{ short }} too short to match anything.</span
                      >
                    }
                  </label>
                  <div class="flex items-end gap-2">
                    @if (identity.verifiedDomains?.length) {
                      <span
                        class="inline-flex h-9 items-center gap-1 text-xs text-muted-foreground"
                        title="Verified in production"
                      >
                        <lucide-icon name="check" class="h-3.5 w-3.5" />
                        {{ identity.verifiedDomains?.length }} verified
                      </span>
                    }
                    <volt-button
                      variant="outline"
                      size="sm"
                      [attr.aria-label]="'Remove group ' + identity.name"
                      (click)="removeIdentity(identity.slug)"
                    >
                      <lucide-icon name="trash-2" class="h-4 w-4" />
                    </volt-button>
                  </div>
                </li>
              }
            </ul>
            <form
              class="flex flex-wrap items-end gap-2"
              (submit)="addIdentity($event, identityName)"
            >
              <label class="text-xs text-muted-foreground">
                New discovery group
                <input
                  #identityName
                  class="mt-1 h-9 w-56 rounded-md border border-border bg-background px-3 text-sm text-foreground"
                  maxlength="60"
                  placeholder="Billing"
                  data-testid="new-identity-name"
                />
              </label>
              <volt-button type="submit" variant="outline" size="sm">
                <lucide-icon name="plus" class="mr-1 h-4 w-4" />
                Add group
              </volt-button>
              <volt-button
                type="button"
                variant="outline"
                size="sm"
                (click)="restoreIdentities()"
                data-testid="restore-identities"
              >
                Restore built-in groups
              </volt-button>
            </form>
          </div>
        </details>
      }

      <section class="space-y-4" aria-labelledby="discovered-heading">
        <div>
          <h2 id="discovered-heading" class="text-lg font-semibold">
            Discovered in Cloudflare
          </h2>
          <p class="text-sm text-muted-foreground">
            Workers and Pages no project owns yet, grouped by application name
            and known aliases. Nothing here is saved — open one to save it as a
            project.
          </p>
        </div>

        <app-cloud-gate [status]="hub.status()">
          @if (shownDiscovered().length) {
            <div
              class="grid gap-4 md:grid-cols-2 2xl:grid-cols-3"
              [moveStagger]="45"
              data-testid="discovered-grid"
            >
              @for (view of shownDiscovered(); track view.slug) {
                <div class="space-y-2" [attr.data-discovered]="view.slug">
                  <ng-container
                    *ngTemplateOutlet="
                      card;
                      context: { $implicit: view, editing: editor.editing() }
                    "
                  />
                  <div
                    class="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border bg-muted/30 p-2 text-sm"
                  >
                    @if (editor.editing()) {
                      <volt-button
                        variant="outline"
                        size="sm"
                        [attr.aria-label]="'Hide ' + view.name"
                        data-testid="hide-discovered"
                        (click)="hideDiscovered(view)"
                      >
                        <lucide-icon name="eye-off" class="mr-1 h-4 w-4" />
                        Hide
                      </volt-button>
                    }
                    @if (savedViews().length) {
                      <select
                        class="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm disabled:opacity-50"
                        [attr.aria-label]="
                          'Project to assign ' + view.name + ' to'
                        "
                        [disabled]="!hub.canLink() || assigning() === view.slug"
                        data-testid="assign-select"
                        #target
                      >
                        <option value="">Assign to project…</option>
                        @for (saved of savedViews(); track saved.slug) {
                          <option [value]="saved.project?.id">
                            {{ saved.name }}
                          </option>
                        }
                      </select>
                      <volt-button
                        variant="outline"
                        size="sm"
                        [disabled]="
                          !hub.canLink() ||
                          !target.value ||
                          assigning() === view.slug
                        "
                        data-testid="assign-button"
                        (click)="assign(view, target.value)"
                      >
                        @if (assigning() === view.slug) {
                          <lucide-icon
                            name="loader"
                            class="mr-1 h-4 w-4 animate-spin"
                          />
                        }
                        Assign
                      </volt-button>
                      @if (!hub.canLink()) {
                        <span
                          class="flex w-full items-center gap-1 text-xs text-muted-foreground"
                        >
                          <lucide-icon name="lock" class="h-3.5 w-3.5" />
                          Assigning needs verified Cloudflare access:
                          {{ hub.unavailable() ?? 'not available here' }}.
                        </span>
                      }
                    } @else {
                      <span class="text-xs text-muted-foreground"
                        >Create a project to assign this to it.</span
                      >
                    }
                  </div>
                </div>
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

    <ng-template #savedCard let-id let-editing="editing">
      @if (savedViewByKey().get(id); as view) {
        <ng-container
          *ngTemplateOutlet="
            card;
            context: { $implicit: view, editing: editing }
          "
        />
      }
    </ng-template>

    <ng-template #card let-view let-editing="editing">
      <!-- While editing the card is not a link, so a drag or a stray click
           can never navigate away. -->
      <a
        [routerLink]="editing ? null : ['/projects', view.slug]"
        [attr.role]="editing ? 'group' : null"
        [move]="'fade-up'"
        moveDuration="260"
        class="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        [class.pointer-events-none]="editing"
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
  readonly #custom = inject(DashboardCustomization);
  readonly #router = inject(Router);

  protected readonly editor = new LayoutEditor({
    save: (layout) => this.#custom.saveLayout(layout),
    reset: () => this.#custom.resetLayout(),
  });
  /** Discovery-group edits made in the current edit session; null otherwise. */
  protected readonly identityDraft = signal<Identity[] | null>(null);
  protected readonly confirmingReset = signal(false);
  protected readonly notice = signal('');
  protected readonly assigning = signal<string | null>(null);

  protected readonly newName = signal('');
  protected readonly newRepoUrl = signal('');
  protected readonly creating = signal(false);
  protected readonly isCreating = signal(false);
  protected readonly createError = signal('');

  protected readonly relative = formatRelative;
  protected readonly repo = repoLabel;
  protected readonly unresolved = unresolvedCount;

  /** Built-in groups with the user's saved edits; the draft while editing. */
  protected readonly identities = computed(
    () =>
      this.identityDraft() ??
      effectiveIdentities(WATCHED_PROJECTS, this.#custom.identities() ?? []),
  );

  protected readonly views = computed(() =>
    buildProjectViews({
      saved: this.hub.projects() ?? [],
      inventory: this.hub.inventory(),
      unavailable: this.hub.unavailable() ?? undefined,
      identities: this.identities(),
    }),
  );

  protected readonly savedViews = computed(() => this.views().projects);

  /** Layout item keys: `saved:<project id>` / `discovered:<slug>`. */
  protected readonly savedViewByKey = computed(
    () =>
      new Map(
        this.views()
          .projects.filter((view) => view.project)
          .map((view) => [`saved:${view.project?.id}`, view]),
      ),
  );
  readonly #discoveredByKey = computed(
    () =>
      new Map(
        this.views().discovered.map((view) => [
          `discovered:${view.slug}`,
          view,
        ]),
      ),
  );

  /** Discovered cards the user has not hidden (all of them while editing). */
  protected readonly shownDiscovered = computed(() => {
    const hidden = new Set(this.editor.layout().hiddenIds);
    return this.views().discovered.filter(
      (view) => this.editor.editing() || !hidden.has(`discovered:${view.slug}`),
    );
  });

  /** Only saved projects sit on the board; discovered cards stay in their own section. */
  protected readonly savedLabel = (id: string): string | null =>
    this.savedViewByKey().get(id)?.name ?? null;
  protected readonly anyLabel = (id: string): string | null =>
    this.savedViewByKey().get(id)?.name ??
    this.#discoveredByKey().get(id)?.name ??
    null;

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
      if (typeof window === 'undefined') return;
      void this.hub.load();
      void this.#custom
        .load()
        .catch((error: unknown) =>
          this.notice.set(
            error instanceof Error
              ? `Could not load your saved layout: ${error.message}`
              : 'Could not load your saved layout.',
          ),
        );
    });

    // Reconcile the stored layout with the saved projects that exist now.
    effect(() => {
      this.editor.setAvailable([...this.savedViewByKey().keys()]);
    });
    effect(() => {
      const stored = this.#custom.layout();
      if (stored) this.editor.setSource(stored);
    });
  }

  protected setLayout(next: DashboardLayout) {
    return () => next;
  }

  protected startEdit(): void {
    this.notice.set('');
    this.confirmingReset.set(false);
    this.identityDraft.set(this.identities());
    this.editor.start();
  }

  protected cancelEdit(): void {
    this.editor.cancel();
    this.identityDraft.set(null);
    this.confirmingReset.set(false);
  }

  protected async saveEdit(): Promise<void> {
    // Discovery groups first: if that fails nothing has changed and the user
    // keeps editing; the layout is only left once both are stored.
    const draft = this.identityDraft();
    if (draft) {
      const overrides = diffIdentities(WATCHED_PROJECTS, draft);
      const stored = this.#custom.identities() ?? [];
      if (JSON.stringify(overrides) !== JSON.stringify(stored)) {
        try {
          await this.#custom.saveIdentities(overrides);
        } catch (error: unknown) {
          this.notice.set(
            error instanceof Error
              ? error.message
              : 'Could not save the discovery groups.',
          );
          return;
        }
      }
    }
    if (await this.editor.save()) {
      this.identityDraft.set(null);
      this.notice.set('Dashboard saved.');
    }
  }

  protected async resetLayout(): Promise<void> {
    if (!this.confirmingReset()) {
      this.confirmingReset.set(true);
      return;
    }
    this.confirmingReset.set(false);
    if (await this.editor.reset()) {
      this.identityDraft.set(null);
      this.notice.set(
        'Default layout restored. Your projects and their resources are unchanged.',
      );
    }
  }

  protected hideDiscovered(view: ProjectView): void {
    const key = `discovered:${view.slug}`;
    this.editor.apply((layout) =>
      layout.hiddenIds.includes(key)
        ? layout
        : { ...layout, hiddenIds: [...layout.hiddenIds, key] },
    );
  }

  /** Links every resource of a discovered card to a saved project. */
  protected async assign(view: ProjectView, projectId: string): Promise<void> {
    if (!projectId) return;
    this.notice.set('');
    this.assigning.set(view.slug);
    const failures: string[] = [];
    let linked = 0;
    for (const resource of view.resources) {
      try {
        await this.#projects.linkResource(projectId, {
          type: resource.type,
          resourceId: resource.resourceId,
        });
        linked += 1;
      } catch (error: unknown) {
        failures.push(
          `${resource.name}: ${error instanceof Error ? error.message : 'could not be linked'}`,
        );
      }
    }
    this.assigning.set(null);
    const target = this.views().projects.find(
      (candidate) => candidate.project?.id === projectId,
    );
    this.notice.set(
      [
        linked
          ? `Linked ${linked} ${linked === 1 ? 'resource' : 'resources'} to ${target?.name ?? 'the project'}.`
          : '',
        ...failures,
      ]
        .filter(Boolean)
        .join(' '),
    );
  }

  protected renameIdentity(slug: string, event: Event): void {
    const value = (event.target as HTMLInputElement).value.trim();
    if (!value) return;
    this.#editIdentity(slug, (identity) => ({ ...identity, name: value }));
  }

  protected setAliases(slug: string, event: Event): void {
    const aliases = parseAliasList((event.target as HTMLInputElement).value);
    this.#editIdentity(slug, (identity) => ({ ...identity, aliases }));
  }

  protected removeIdentity(slug: string): void {
    this.identityDraft.update((list) =>
      (list ?? []).filter((identity) => identity.slug !== slug),
    );
  }

  protected addIdentity(event: Event, input: HTMLInputElement): void {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) return;
    const list = this.identityDraft() ?? [];
    const slug = newIdentitySlug(name, new Set(list.map((i) => i.slug)));
    this.identityDraft.set([
      ...list,
      { name, slug, aliases: [], builtIn: false },
    ]);
    input.value = '';
  }

  protected restoreIdentities(): void {
    this.identityDraft.set(effectiveIdentities(WATCHED_PROJECTS, []));
  }

  protected shortAliases(identity: Identity): string {
    return identity.aliases.filter((alias) => !isMatchable(alias)).join(', ');
  }

  #editIdentity(slug: string, change: (identity: Identity) => Identity): void {
    this.identityDraft.update((list) =>
      (list ?? []).map((identity) =>
        identity.slug === slug ? change(identity) : identity,
      ),
    );
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
