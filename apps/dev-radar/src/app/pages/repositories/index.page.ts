import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import {
  DashboardBoard,
  LayoutEditor,
  isPinned,
  selectItems,
  type DashboardLayout,
} from '@org/dashboard-layout';
import type { CiState } from '../../../shared/ci-state';
import type { RepositoryDto } from '../../../shared/dto';
import { CiBadgeComponent } from '../../components/ci-badge.component';
import { ManageRepositoriesComponent } from '../../components/manage-repositories.component';
import { PageStateComponent } from '../../components/page-state.component';
import {
  DEFAULT_REPOSITORY_FILTER,
  filterRepositories,
  type RepositoryFilter,
} from '../../radar/filters';
import { shortSha, timeAgo } from '../../radar/format';
import { RadarApi } from '../../radar/radar-api.service';
import { Remote } from '../../radar/remote';

const CI_VALUES: readonly string[] = [
  'unknown',
  'none',
  'pending',
  'success',
  'failure',
];
const FIELD =
  'h-9 rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

@Component({
  selector: 'app-repositories-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    RouterLink,
    LucideAngularModule,
    CiBadgeComponent,
    DashboardBoard,
    ManageRepositoriesComponent,
    PageStateComponent,
  ],
  template: `
    <div class="space-y-6">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="text-3xl font-bold tracking-tight">Repositories</h1>
          <p class="mt-1 text-muted-foreground">
            The repositories you follow, with the state of their default branch.
            @if (available.data(); as data) {
              <span data-testid="follow-summary"
                >{{ followed().length }} followed of
                {{ data.repositories.length }} available.</span
              >
            }
          </p>
        </div>

        @if (available.data() && !managing()) {
          <div class="flex flex-wrap items-center gap-2" data-testid="toolbar">
            @if (editor.editing()) {
              <button
                type="button"
                class="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
                [disabled]="editor.saving()"
                (click)="saveEdit()"
                data-testid="save-layout"
              >
                @if (editor.saving()) {
                  <lucide-icon name="loader" class="h-4 w-4 animate-spin" />
                }
                Save layout
              </button>
              <button
                type="button"
                class="h-9 rounded-md border border-border px-3 text-sm hover:bg-muted"
                [disabled]="editor.saving()"
                (click)="editor.cancel(); confirmingReset.set(false)"
                data-testid="cancel-layout"
              >
                Cancel
              </button>
              <button
                type="button"
                class="h-9 rounded-md border border-border px-3 text-sm hover:bg-muted"
                [class.border-red-500]="confirmingReset()"
                [disabled]="editor.saving()"
                (click)="resetLayout()"
                data-testid="reset-layout"
              >
                {{
                  confirmingReset()
                    ? 'Confirm: drop groups and pins'
                    : 'Restore default layout'
                }}
              </button>
            } @else {
              <button
                type="button"
                class="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-muted"
                (click)="managing.set(true)"
                data-testid="manage-button"
              >
                <lucide-icon name="folder-git-2" class="h-4 w-4" />
                Manage repositories
              </button>
              @if (followed().length > 0) {
                <button
                  type="button"
                  class="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-muted"
                  (click)="startEdit()"
                  data-testid="edit-dashboard"
                >
                  <lucide-icon name="pencil" class="h-4 w-4" />
                  Edit dashboard
                </button>
              }
            }
          </div>
        }
      </div>

      @if (editor.error()) {
        <p
          class="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-300"
          role="alert"
        >
          {{ editor.error() }}
        </p>
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
          Editing your dashboard. Drag a card by its grip, or use the arrows,
          “Move to group” and Unfollow on each card. Nothing is saved until you
          choose Save layout.
        </p>
      }

      @if (available.loading() || layoutRemote.loading()) {
        <app-page-state kind="loading" />
      } @else if (available.status() === 'error') {
        <app-page-state
          kind="error"
          [message]="available.error() ?? ''"
          (retry)="reload()"
        />
      } @else if (available.data(); as data) {
        @if (managing()) {
          <app-manage-repositories
            [repositories]="data.repositories"
            [saving]="manageSaving()"
            [error]="manageError()"
            (saved)="saveSelection($event)"
            (cancelled)="managing.set(false)"
          />
        }

        @if (data.repositories.length === 0) {
          <app-page-state
            kind="empty"
            icon="folder-git-2"
            title="No repositories yet"
          >
            Connect the GitHub App and run a sync from Settings. Nothing is
            shown until GitHub reports it.
          </app-page-state>
        } @else if (followed().length === 0) {
          @if (!managing()) {
            <div
              class="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-10 text-center"
              data-testid="onboarding"
            >
              <lucide-icon
                name="folder-git-2"
                class="h-6 w-6 text-muted-foreground"
              />
              <p class="font-medium">You are not following any repositories</p>
              <p class="max-w-md text-sm text-muted-foreground">
                GitHub shows {{ data.repositories.length }} available
                {{
                  data.repositories.length === 1
                    ? 'repository'
                    : 'repositories'
                }}. Choose the ones that matter; only those appear on your
                dashboard and in its totals.
              </p>
              <button
                type="button"
                class="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
                (click)="managing.set(true)"
                data-testid="select-repositories"
              >
                Select repositories
              </button>
            </div>
          }
        } @else {
          @if (!editor.editing()) {
            <form
              class="flex flex-wrap items-end gap-3"
              role="search"
              (submit)="$event.preventDefault()"
            >
              <label
                class="flex min-w-48 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground"
              >
                Search
                <input
                  type="search"
                  [class]="field"
                  placeholder="Name or description"
                  [ngModel]="effectiveFilter().query"
                  (ngModelChange)="patch({ query: $event })"
                  name="query"
                  aria-label="Search repositories"
                />
              </label>
              <label
                class="flex flex-col gap-1 text-xs font-medium text-muted-foreground"
              >
                CI
                <select
                  [class]="field"
                  [ngModel]="effectiveFilter().ci"
                  (ngModelChange)="setCi($event)"
                  name="ci"
                  aria-label="Filter by CI state"
                >
                  <option value="all">Any</option>
                  <option value="failure">Failing</option>
                  <option value="pending">Running</option>
                  <option value="success">Passing</option>
                  <option value="none">No CI</option>
                  <option value="unknown">Unknown</option>
                </select>
              </label>
              <label
                class="flex flex-col gap-1 text-xs font-medium text-muted-foreground"
              >
                Visibility
                <select
                  [class]="field"
                  [ngModel]="effectiveFilter().visibility"
                  (ngModelChange)="patch({ visibility: $event })"
                  name="visibility"
                  aria-label="Filter by visibility"
                >
                  <option value="all">All</option>
                  <option value="public">Public</option>
                  <option value="private">Private</option>
                </select>
              </label>
              <label class="flex items-center gap-2 pb-2 text-sm">
                <input
                  type="checkbox"
                  [ngModel]="effectiveFilter().withOpenPullRequests"
                  (ngModelChange)="patch({ withOpenPullRequests: $event })"
                  name="withPrs"
                />
                Open PRs only
              </label>
              <label class="flex items-center gap-2 pb-2 text-sm">
                <input
                  type="checkbox"
                  [ngModel]="effectiveFilter().showArchived"
                  (ngModelChange)="patch({ showArchived: $event })"
                  name="archived"
                />
                Show archived
              </label>
            </form>

            <p
              class="text-sm text-muted-foreground"
              aria-live="polite"
              data-testid="result-count"
            >
              {{ visible().length }} of {{ followed().length }} followed
              repositories
            </p>
          }

          @if (!editor.editing() && visible().length === 0) {
            <app-page-state
              kind="empty"
              icon="search"
              title="No repositories match"
            >
              Adjust the search or filters.
            </app-page-state>
          } @else {
            <dash-board
              [layout]="editor.layout()"
              [editing]="editor.editing()"
              [itemTemplate]="card"
              [labelOf]="labelOf"
              [allowPin]="true"
              hideLabel="Unfollow"
              restoreLabel="Follow again"
              gridClass="grid gap-3"
              (layoutChange)="editor.apply(setLayout($event))"
            />
            <ng-template #card let-id let-editing="editing">
              @if (repoById().get(+id); as repo) {
                <div
                  class="rounded-lg border bg-card p-4"
                  [class.border-border]="!editing"
                  [class.border-primary]="editing"
                  [attr.data-repo]="repo.fullName"
                  data-testid="repository-card"
                >
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="min-w-0 space-y-1">
                      <div class="flex flex-wrap items-center gap-2">
                        @if (editing) {
                          <span class="truncate text-base font-semibold">{{
                            repo.fullName
                          }}</span>
                        } @else {
                          <a
                            [routerLink]="['/repositories', repo.id]"
                            class="truncate text-base font-semibold hover:text-primary"
                            >{{ repo.fullName }}</a
                          >
                        }
                        @if (isPinned(repo.id)) {
                          <lucide-icon
                            name="pin"
                            class="h-3.5 w-3.5 text-primary"
                            aria-label="Pinned"
                          />
                        }
                        <a
                          [href]="repo.htmlUrl"
                          target="_blank"
                          rel="noreferrer"
                          class="text-muted-foreground hover:text-primary"
                          [attr.aria-label]="
                            'Open ' + repo.fullName + ' on GitHub'
                          "
                        >
                          <lucide-icon
                            name="external-link"
                            class="h-3.5 w-3.5"
                          />
                        </a>
                        <span
                          class="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
                        >
                          {{ repo.private ? 'Private' : 'Public' }}
                        </span>
                        @if (repo.archived) {
                          <span
                            class="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
                            >Archived</span
                          >
                        }
                      </div>
                      @if (repo.description) {
                        <p class="text-sm text-muted-foreground">
                          {{ repo.description }}
                        </p>
                      }
                    </div>
                    <div class="flex flex-col items-end gap-1">
                      <app-ci-badge [state]="repo.ci.state" />
                      @if (repo.ciStale) {
                        <span class="text-xs text-muted-foreground"
                          >for {{ sha(repo.ci.sha) }}, not the latest
                          commit</span
                        >
                      }
                    </div>
                  </div>

                  <dl
                    class="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4"
                  >
                    <div>
                      <dt class="text-xs text-muted-foreground">
                        Default branch
                      </dt>
                      <dd class="flex items-center gap-1">
                        <lucide-icon name="git-branch" class="h-3.5 w-3.5" />{{
                          repo.defaultBranch
                        }}
                      </dd>
                    </div>
                    <div class="col-span-2">
                      <dt class="text-xs text-muted-foreground">
                        Latest commit
                      </dt>
                      <dd class="truncate">
                        @if (repo.head) {
                          <code class="text-xs">{{ sha(repo.head.sha) }}</code>
                          {{ repo.head.message ?? '' }}
                          <span class="text-muted-foreground">
                            {{
                              repo.head.author ? '· ' + repo.head.author : ''
                            }}
                            {{
                              repo.head.committedAt
                                ? '· ' + ago(repo.head.committedAt)
                                : ''
                            }}
                          </span>
                        } @else {
                          <span class="text-muted-foreground"
                            >Not synced yet</span
                          >
                        }
                      </dd>
                    </div>
                    <div>
                      <dt class="text-xs text-muted-foreground">Open PRs</dt>
                      <dd>{{ repo.openPullRequests }}</dd>
                    </div>
                    <div>
                      <dt class="text-xs text-muted-foreground">Version</dt>
                      <dd>
                        @if (repo.version) {
                          <span class="inline-flex items-center gap-1">
                            <lucide-icon name="tag" class="h-3.5 w-3.5" />{{
                              repo.version.value
                            }}
                            @if (repo.version.source === 'tag') {
                              <span class="text-xs text-muted-foreground"
                                >(tag)</span
                              >
                            }
                          </span>
                        } @else {
                          <span class="text-muted-foreground">—</span>
                        }
                      </dd>
                    </div>
                    <div>
                      <dt class="text-xs text-muted-foreground">Synced</dt>
                      <dd>{{ ago(repo.lastSyncedAt) }}</dd>
                    </div>
                  </dl>
                </div>
              }
            </ng-template>
          }
        }
      }
    </div>
  `,
})
export default class RepositoriesPage {
  readonly #api = inject(RadarApi);
  /** Everything the GitHub App can read, each flagged `followed`. */
  protected readonly available = new Remote<{
    repositories: RepositoryDto[];
  }>(() => this.#api.availableRepositories());
  protected readonly layoutRemote = new Remote<{ layout: DashboardLayout }>(
    () => this.#api.dashboardLayout(),
  );

  protected readonly editor = new LayoutEditor({
    // Leaving a repository out of the layout is what unfollows it, so the
    // hidden tray collapses into "not followed" when the layout is saved.
    save: async (layout) =>
      (await this.#api.saveDashboardLayout({ ...layout, hiddenIds: [] }))
        .layout,
    reset: async () => (await this.#api.resetDashboardLayout()).layout,
  });

  /** `?ci=failure`, bound from the URL (links from the Overview totals). */
  readonly ci = input<string>();
  /** `?manage=1`, from the Overview's "Select repositories". */
  readonly manage = input<string>();

  protected readonly field = FIELD;
  protected readonly filter = signal<RepositoryFilter>(
    DEFAULT_REPOSITORY_FILTER,
  );
  readonly #ciChosen = signal(false);

  protected readonly managing = signal(false);
  protected readonly manageSaving = signal(false);
  protected readonly manageError = signal<string | null>(null);
  protected readonly confirmingReset = signal(false);
  protected readonly notice = signal('');

  protected readonly followed = computed(() =>
    (this.available.data()?.repositories ?? []).filter((r) => r.followed),
  );
  protected readonly repoById = computed(
    () => new Map(this.followed().map((r) => [r.id, r])),
  );

  protected readonly effectiveFilter = computed<RepositoryFilter>(() => {
    const current = this.filter();
    const fromUrl = this.ci();
    if (!this.#ciChosen() && fromUrl && CI_VALUES.includes(fromUrl)) {
      return { ...current, ci: fromUrl as CiState };
    }
    return current;
  });

  protected readonly visible = computed(() =>
    filterRepositories(this.followed(), this.effectiveFilter()),
  );
  readonly #visibleIds = computed(
    () => new Set(this.visible().map((r) => String(r.id))),
  );

  /** A card's name; null hides it (filtered out, or not followed). */
  protected readonly labelOf = (id: string): string | null => {
    const repo = this.repoById().get(Number(id));
    if (!repo) return null;
    return this.editor.editing() || this.#visibleIds().has(id)
      ? repo.fullName
      : null;
  };

  protected readonly sha = shortSha;
  protected readonly ago = (iso: string | null) => timeAgo(iso);

  constructor() {
    void this.reload();
    effect(() => {
      this.editor.setAvailable(this.followed().map((r) => String(r.id)));
    });
    effect(() => {
      const stored = this.layoutRemote.data();
      if (stored) this.editor.setSource(stored.layout);
    });
    effect(() => {
      if (this.manage() && this.available.data()) this.managing.set(true);
    });
  }

  protected async reload(): Promise<void> {
    await Promise.all([this.available.load(), this.layoutRemote.load()]);
  }

  protected isPinned(id: number): boolean {
    return isPinned(this.editor.layout(), String(id));
  }

  protected setLayout(next: DashboardLayout) {
    return () => next;
  }

  protected startEdit(): void {
    this.notice.set('');
    this.confirmingReset.set(false);
    this.editor.start();
  }

  protected async saveEdit(): Promise<void> {
    if (await this.editor.save()) {
      await this.available.load();
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
      await this.available.load();
      this.notice.set(
        'Default layout restored. You still follow the same repositories.',
      );
    }
  }

  protected async saveSelection(ids: number[]): Promise<void> {
    this.manageSaving.set(true);
    this.manageError.set(null);
    try {
      const next = selectItems(this.editor.saved(), ids.map(String));
      const saved = await this.#api.saveDashboardLayout({
        ...next,
        hiddenIds: [],
      });
      this.editor.setSource(saved.layout);
      await this.available.load();
      this.managing.set(false);
      this.notice.set(
        ids.length === 0
          ? 'You are not following any repositories.'
          : `Following ${ids.length} ${ids.length === 1 ? 'repository' : 'repositories'}.`,
      );
    } catch (error) {
      this.manageError.set(
        error instanceof Error
          ? error.message
          : 'Could not save your selection.',
      );
    } finally {
      this.manageSaving.set(false);
    }
  }

  protected patch(change: Partial<RepositoryFilter>): void {
    this.filter.set({ ...this.effectiveFilter(), ...change });
  }

  protected setCi(value: CiState | 'all'): void {
    this.#ciChosen.set(true);
    this.patch({ ci: value });
  }
}
