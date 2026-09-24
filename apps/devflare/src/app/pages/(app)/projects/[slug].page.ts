import {
  Component,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
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
  RESOURCE_TYPE_META,
  countLabel,
  formatRelative,
  linkCandidates,
  ownershipIndex,
  resourceCounts,
  type CloudDeployment,
  type CloudPagesProject,
  type CloudResourceRef,
  type ResolvedResource,
} from '@org/core';
import { DeploymentStatus } from '../cloud/deployment-status';
import {
  buildProjectViews,
  findProjectView,
  repoLabel,
  resourceUrls,
} from '../dashboard-projects';
import { LinkResourcesPanel } from './link-resources-panel';
import { ResourceList } from './resource-list';

/** Enough to see what shipped recently; full history is on the Pages page. */
const MAX_DEPLOYMENTS = 10;

interface ProjectDeployment {
  pagesProject: string;
  deployment: CloudDeployment;
}

/**
 * One project — the central surface of DevFlare (spec 019).
 *
 * Overview (where it lives), Resources (what it owns, each resolved against
 * Cloudflare), Deployments (of the Pages projects it owns) and Actions. One
 * page rather than tabs: each section is short, and the inventory is the point.
 *
 * A discovered project (unowned resources grouped by name) renders read-only
 * with a "Save as project" action, which creates the project and links each
 * resource explicitly — through the same verified API as "Link resource".
 */
@Component({
  selector: 'app-project-detail-page',
  imports: [
    RouterLink,
    LucideAngularModule,
    VoltButton,
    VoltCard,
    VoltCardContent,
    VoltError,
    VoltFormField,
    VoltInput,
    VoltLabel,
    DeploymentStatus,
    LinkResourcesPanel,
    ResourceList,
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
          <div class="flex min-w-0 items-center gap-2">
            <h1 class="truncate text-3xl font-bold tracking-tight">
              {{ view()?.name ?? slug() }}
            </h1>
            @if (view()?.kind === 'discovered') {
              <span
                class="shrink-0 rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground"
                >Not saved</span
              >
            }
          </div>
          @if (view(); as current) {
            <p class="mt-1 text-sm text-muted-foreground">
              {{ countsLine() || 'No resources linked' }}
              @if (current.lastActivity; as lastActivity) {
                · latest activity {{ relative(lastActivity) }}
              }
            </p>
          }
        </div>

        <div class="flex flex-wrap items-center gap-2">
          @if (view()?.url; as url) {
            <a [href]="url" target="_blank" rel="noreferrer">
              <volt-button size="sm">
                <lucide-icon name="external-link" class="mr-1 h-4 w-4" />
                Open site
              </volt-button>
            </a>
          }
          @if (view()?.repoUrl; as repo) {
            <a [href]="repo" target="_blank" rel="noreferrer">
              <volt-button size="sm" variant="outline">
                <lucide-icon name="github" class="mr-1 h-4 w-4" />
                Repository
              </volt-button>
            </a>
          }
          <volt-button variant="ghost" size="sm" (click)="reload()">
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
      @if (notice()) {
        <p
          role="status"
          class="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400"
        >
          {{ notice() }}
        </p>
      }
      @for (message of errors(); track $index) {
        <volt-error>{{ message }}</volt-error>
      }

      @if (hub.loading() && !view()) {
        <div class="flex items-center justify-center py-12">
          <lucide-icon
            name="loader"
            class="h-8 w-8 animate-spin text-muted-foreground"
          />
        </div>
      } @else if (view(); as current) {
        <!-- Overview: where it lives, where the code is, what happened last. -->
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
            @if (current.repoUrl; as repo) {
              <a
                [href]="repo"
                target="_blank"
                rel="noreferrer"
                class="flex min-w-0 items-center gap-2 text-sm hover:text-primary hover:underline"
              >
                <lucide-icon name="github" class="h-4 w-4 shrink-0" />
                <span class="truncate">{{ repoText(repo) }}</span>
              </a>
            } @else {
              <p class="text-sm text-muted-foreground">Not set.</p>
            }
          </div>

          <div class="min-w-0 space-y-1">
            <p class="text-xs font-medium uppercase text-muted-foreground">
              Latest deployment
            </p>
            @if (current.latestDeployment; as latest) {
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

        <!-- Resources -->
        <section class="space-y-4" aria-labelledby="resources-heading">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h2 id="resources-heading" class="text-lg font-semibold">
              Resources
            </h2>
            @if (current.kind === 'saved') {
              <volt-button
                size="sm"
                variant="outline"
                [disabled]="!hub.canLink()"
                [attr.aria-expanded]="linking()"
                aria-controls="link-resources"
                (click)="linking.set(!linking())"
              >
                <lucide-icon name="plus" class="mr-1 h-4 w-4" />
                Link resource
              </volt-button>
            } @else {
              <volt-button
                size="sm"
                [disabled]="saving() || !hub.canLink()"
                (click)="saveDiscovered()"
              >
                @if (saving()) {
                  <lucide-icon
                    name="loader"
                    class="mr-1 h-4 w-4 animate-spin"
                  />
                } @else {
                  <lucide-icon name="plus" class="mr-1 h-4 w-4" />
                }
                Save as project
              </volt-button>
            }
          </div>

          @if (current.kind === 'discovered') {
            <p class="text-sm text-muted-foreground">
              Grouped by name from your Cloudflare account — not saved. Saving
              creates a DevFlare project that explicitly owns these resources.
            </p>
          }

          @if (!hub.canLink() && hub.unavailable(); as reason) {
            <p
              class="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground"
            >
              <lucide-icon name="lock" class="mt-0.5 h-4 w-4 shrink-0" />
              Resources cannot be verified or linked right now: {{ reason }}.
            </p>
          }

          @if (linking() && candidates(); as sections) {
            <div id="link-resources">
              <app-link-resources-panel
                [sections]="sections"
                [busy]="linkBusy()"
                (submitted)="linkSelected($event)"
                (cancelled)="linking.set(false)"
              />
            </div>
          }

          @if (current.resources.length) {
            <app-resource-list
              [resources]="current.resources"
              [mode]="current.kind === 'saved' ? 'owned' : 'discovered'"
              [busy]="unlinking()"
              (unlink)="unlink($event)"
            />
          } @else {
            <p
              class="rounded-md border border-border p-4 text-muted-foreground"
            >
              No resources linked yet.
              @if (hub.canLink()) {
                Use “Link resource” to add Workers, Pages, D1, R2 or KV.
              }
            </p>
          }

          @if (current.suggestions.length) {
            <div class="space-y-2" aria-labelledby="suggestions-heading">
              <h3
                id="suggestions-heading"
                class="text-sm font-medium text-muted-foreground"
              >
                Suggested from Cloudflare — names resemble this project, not
                linked
              </h3>
              <ul
                class="divide-y divide-border rounded-md border border-dashed border-border"
              >
                @for (
                  ref of current.suggestions;
                  track ref.type + ref.resourceId
                ) {
                  <li
                    class="flex items-center justify-between gap-3 px-4 py-2 text-sm"
                    data-testid="resource-suggestion"
                  >
                    <span class="flex min-w-0 items-center gap-2">
                      <lucide-icon
                        [name]="meta[ref.type].icon"
                        class="h-4 w-4 shrink-0 text-muted-foreground"
                      />
                      <span class="truncate">{{ ref.name }}</span>
                      <span class="text-xs text-muted-foreground">{{
                        meta[ref.type].label
                      }}</span>
                    </span>
                    <volt-button
                      size="sm"
                      variant="ghost"
                      [disabled]="linkBusy() || !hub.canLink()"
                      (click)="linkSelected([ref])"
                    >
                      <lucide-icon name="link" class="mr-1 h-4 w-4" />
                      Link<span class="sr-only">&#32;{{ ref.name }}</span>
                    </volt-button>
                  </li>
                }
              </ul>
            </div>
          }
        </section>

        <!-- Deployments: only the Pages projects this project owns. -->
        @if (current.pages.length) {
          <section class="space-y-4" aria-labelledby="deployments-heading">
            <div class="flex items-center justify-between gap-3">
              <h2 id="deployments-heading" class="text-lg font-semibold">
                Deployments
              </h2>
              <span class="text-sm text-muted-foreground">
                Pages · newest first
              </span>
            </div>

            <ul class="space-y-2">
              @for (project of current.pages; track project.name) {
                <li
                  class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card p-3"
                >
                  <span class="flex min-w-0 items-center gap-2 text-sm">
                    <lucide-icon
                      name="globe"
                      class="h-4 w-4 shrink-0 text-muted-foreground"
                    />
                    <span class="truncate font-medium">{{ project.name }}</span>
                    <span class="text-muted-foreground"
                      >production branch {{ project.productionBranch }}</span
                    >
                  </span>
                  <div class="flex flex-wrap items-center gap-2">
                    <a [routerLink]="['/cloud/pages', project.name]">
                      <volt-button size="sm" variant="outline">
                        <lucide-icon name="activity" class="mr-1 h-4 w-4" />
                        Deployments &amp; rollback
                      </volt-button>
                    </a>
                    @if (project.gitConnected) {
                      @if (confirmingDeploy() === project.name) {
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
                          (click)="confirmingDeploy.set('')"
                        >
                          Cancel
                        </volt-button>
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
                </li>
              }
            </ul>

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

        <!-- Actions: the project's own record. -->
        @if (current.project; as project) {
          <section class="space-y-4" aria-labelledby="actions-heading">
            <h2 id="actions-heading" class="text-lg font-semibold">Actions</h2>

            <form
              class="grid gap-3 rounded-md border border-border bg-card p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto]"
              aria-label="Edit project"
              (submit)="saveDetails($event)"
            >
              <volt-form-field>
                <volt-label>Name</volt-label>
                <volt-input
                  type="text"
                  [(value)]="editName"
                  autocomplete="off"
                  aria-label="Project name"
                />
              </volt-form-field>
              <volt-form-field>
                <volt-label>Repository URL</volt-label>
                <volt-input
                  type="text"
                  placeholder="github.com/owner/repo"
                  [(value)]="editRepoUrl"
                  autocomplete="off"
                  aria-label="Repository URL"
                />
              </volt-form-field>
              <div class="flex items-end">
                <volt-button
                  type="submit"
                  variant="outline"
                  [disabled]="savingDetails() || !editName().trim()"
                >
                  <lucide-icon name="pencil" class="mr-1 h-4 w-4" />
                  Save details
                </volt-button>
              </div>
            </form>

            <div
              class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-500/30 p-4"
            >
              <p class="text-sm text-muted-foreground">
                Deleting removes the project and its resource links from
                DevFlare. Nothing on Cloudflare is touched.
              </p>
              @if (confirmingDelete()) {
                <div class="flex items-center gap-2">
                  <volt-button
                    size="sm"
                    variant="ghost"
                    (click)="confirmingDelete.set(false)"
                  >
                    Cancel
                  </volt-button>
                  <volt-button size="sm" (click)="deleteProject(project.id)">
                    Delete {{ project.name }}
                  </volt-button>
                </div>
              } @else {
                <volt-button
                  size="sm"
                  variant="outline"
                  (click)="confirmingDelete.set(true)"
                >
                  <lucide-icon name="trash-2" class="mr-1 h-4 w-4" />
                  Delete project
                </volt-button>
              }
            </div>
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
  protected readonly hub = inject(ProjectHub);
  readonly #cloud = inject(CloudflareAccount);
  readonly #projects = inject(Projects);
  readonly #router = inject(Router);

  protected readonly meta = RESOURCE_TYPE_META;
  protected readonly relative = formatRelative;
  protected readonly repoText = repoLabel;

  protected readonly notice = signal('');
  protected readonly errors = signal<string[]>([]);
  protected readonly linking = signal(false);
  protected readonly linkBusy = signal(false);
  protected readonly unlinking = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly confirmingDeploy = signal('');
  protected readonly acting = signal('');
  protected readonly editName = signal('');
  protected readonly editRepoUrl = signal('');
  protected readonly savingDetails = signal(false);
  protected readonly confirmingDelete = signal(false);

  protected readonly deployments = signal<ProjectDeployment[]>([]);
  protected readonly deploymentsLoading = signal(false);
  protected readonly deploymentsError = signal('');

  private readonly panel = viewChild(LinkResourcesPanel);

  protected readonly views = computed(() =>
    buildProjectViews({
      saved: this.hub.projects() ?? [],
      inventory: this.hub.inventory(),
      unavailable: this.hub.unavailable() ?? undefined,
    }),
  );

  protected readonly view = computed(() =>
    findProjectView(this.slug(), this.views()),
  );

  protected readonly countsLine = computed(() =>
    resourceCounts(this.view()?.resources ?? [])
      .map((entry) => countLabel(entry.type, entry.count))
      .join(' · '),
  );

  /** Every public URL, custom domains ahead of generated fallbacks. */
  protected readonly liveUrls = computed(() => {
    const view = this.view();
    if (!view) return [];
    return [
      ...new Set([
        ...(view.url ? [view.url] : []),
        ...view.verifiedUrls,
        ...view.pages.flatMap((project) => resourceUrls(project, null)),
        ...view.workers.flatMap((worker) => resourceUrls(null, worker)),
      ]),
    ];
  });

  protected readonly candidates = computed(() => {
    const inventory = this.hub.inventory();
    const project = this.view()?.project;
    if (!inventory || !project) return null;
    return linkCandidates(
      inventory,
      ownershipIndex(this.hub.projects() ?? []),
      project.id,
    );
  });

  /** Which Pages projects' history to show — re-read only when that changes. */
  readonly #pagesKey = computed(() =>
    (this.view()?.pages ?? []).map((project) => project.name).join('\n'),
  );

  constructor() {
    afterNextRender(() => {
      if (typeof window !== 'undefined') void this.hub.load();
    });

    effect(() => {
      this.#pagesKey();
      untracked(() => void this.loadDeployments(false));
    });

    // Keep the edit form on the saved values of whichever project is open.
    effect(() => {
      const project = this.view()?.project ?? null;
      untracked(() => {
        this.editName.set(project?.name ?? '');
        this.editRepoUrl.set(project?.repoUrl ?? '');
      });
    });
  }

  protected async reload(): Promise<void> {
    this.clearMessages();
    await this.hub.load(true);
    await this.loadDeployments(true);
  }

  /**
   * Links each chosen resource in turn. Each is verified by the server on its
   * own, so one refusal (say, R2 without permission) does not undo the rest —
   * it is reported by name instead.
   */
  protected async linkSelected(refs: CloudResourceRef[]): Promise<void> {
    const project = this.view()?.project;
    if (!project) return;

    this.clearMessages();
    this.linkBusy.set(true);
    const { linked, failures } = await this.linkAll(project.id, refs);
    this.linkBusy.set(false);

    if (linked.length) {
      this.notice.set(
        linked.length === 1
          ? `Linked ${linked[0]}.`
          : `Linked ${linked.length} resources.`,
      );
    }
    this.errors.set(failures);
    if (!failures.length) {
      this.panel()?.clear();
      this.linking.set(false);
    }
  }

  protected async unlink(resource: ResolvedResource): Promise<void> {
    const project = this.view()?.project;
    const link = resource.link;
    if (!project || !link) return;

    this.clearMessages();
    this.unlinking.set(link.id);
    try {
      await this.#projects.unlinkResource(project.id, link.id);
      this.notice.set(`Unlinked ${resource.name}.`);
    } catch (error: unknown) {
      this.errors.set([messageOf(error, 'Could not unlink the resource')]);
    } finally {
      this.unlinking.set(null);
    }
  }

  /** A discovered group becomes a project that explicitly owns its resources. */
  protected async saveDiscovered(): Promise<void> {
    const view = this.view();
    if (!view || view.kind !== 'discovered') return;

    this.clearMessages();
    this.saving.set(true);
    try {
      const project = await this.#projects.createProject(
        view.name,
        view.repoUrl ?? undefined,
      );
      const { failures } = await this.linkAll(project.id, view.resources);

      this.notice.set(`Saved ${project.name} as a project.`);
      this.errors.set(failures);
      await this.goToProject(project.id, view.slug);
    } catch (error: unknown) {
      this.errors.set([messageOf(error, 'Could not save the project')]);
    } finally {
      this.saving.set(false);
    }
  }

  protected async saveDetails(event: Event): Promise<void> {
    event.preventDefault();
    const project = this.view()?.project;
    if (!project) return;

    this.clearMessages();
    this.savingDetails.set(true);
    try {
      const updated = await this.#projects.updateProject(project.id, {
        name: this.editName().trim(),
        repoUrl: this.editRepoUrl().trim() || null,
      });
      this.notice.set('Project details saved.');
      await this.goToProject(updated.id, this.slug());
    } catch (error: unknown) {
      this.errors.set([messageOf(error, 'Could not save the project')]);
    } finally {
      this.savingDetails.set(false);
    }
  }

  protected async deleteProject(id: string): Promise<void> {
    this.clearMessages();
    try {
      await this.#projects.deleteProject(id);
      await this.#router.navigate(['/']);
    } catch (error: unknown) {
      this.errors.set([messageOf(error, 'Could not delete the project')]);
      this.confirmingDelete.set(false);
    }
  }

  protected askDeploy(name: string): void {
    this.confirmingDeploy.set(name);
    this.clearMessages();
  }

  protected async redeploy(project: CloudPagesProject): Promise<void> {
    this.acting.set(project.name);
    this.clearMessages();

    try {
      await this.#cloud.deployPages(project.name);
      this.notice.set(
        `Redeploy started for ${project.name}. Cloudflare will update the latest deployment shortly.`,
      );
      this.confirmingDeploy.set('');
      await this.hub.load(true);
      await this.loadDeployments(true);
    } catch (error: unknown) {
      this.errors.set([messageOf(error, 'Could not start redeploy')]);
    } finally {
      this.acting.set('');
    }
  }

  private async linkAll(
    projectId: string,
    refs: readonly Pick<CloudResourceRef, 'type' | 'resourceId' | 'name'>[],
  ): Promise<{ linked: string[]; failures: string[] }> {
    const linked: string[] = [];
    const failures: string[] = [];
    for (const ref of refs) {
      try {
        await this.#projects.linkResource(projectId, {
          type: ref.type,
          resourceId: ref.resourceId,
        });
        linked.push(ref.name);
      } catch (error: unknown) {
        failures.push(
          `${ref.name}: ${messageOf(error, 'could not be linked')}`,
        );
      }
    }
    return { linked, failures };
  }

  /** The slug follows the name, so re-find the project after a save. */
  private async goToProject(id: string, current: string): Promise<void> {
    const slug =
      this.views().projects.find((view) => view.project?.id === id)?.slug ??
      current;
    if (slug !== current) await this.#router.navigate(['/projects', slug]);
  }

  private clearMessages(): void {
    this.notice.set('');
    this.errors.set([]);
  }

  /**
   * History comes from the same per-project endpoint the Cloud Pages page
   * uses, merged across the Pages projects this project owns.
   */
  private async loadDeployments(refresh: boolean): Promise<void> {
    const pages = this.view()?.pages ?? [];
    if (!pages.length) {
      this.deployments.set([]);
      return;
    }

    this.deploymentsLoading.set(true);
    this.deploymentsError.set('');

    try {
      const details = await Promise.all(
        pages.map((project) =>
          this.#cloud.loadPagesProject(project.name, refresh),
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
      this.deploymentsError.set(messageOf(error, 'Could not load deployments'));
    } finally {
      this.deploymentsLoading.set(false);
    }
  }
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
