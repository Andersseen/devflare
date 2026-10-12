import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import type { CiState } from '../../../shared/ci-state';
import type { RepositoryDto } from '../../../shared/dto';
import { CiBadgeComponent } from '../../components/ci-badge.component';
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
    PageStateComponent,
  ],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">Repositories</h1>
        <p class="mt-1 text-muted-foreground">
          Every repository the GitHub App can see, with the state of its default
          branch.
        </p>
      </div>

      @if (repositories.loading()) {
        <app-page-state kind="loading" />
      } @else if (repositories.status() === 'error') {
        <app-page-state
          kind="error"
          [message]="repositories.error() ?? ''"
          (retry)="repositories.load()"
        />
      } @else if (repositories.data(); as data) {
        @if (data.repositories.length === 0) {
          <app-page-state
            kind="empty"
            icon="folder-git-2"
            title="No repositories yet"
          >
            Connect the GitHub App and run a sync from Settings. Nothing is
            shown until GitHub reports it.
          </app-page-state>
        } @else {
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
            {{ visible().length }} of
            {{ data.repositories.length }} repositories
          </p>

          @if (visible().length === 0) {
            <app-page-state
              kind="empty"
              icon="search"
              title="No repositories match"
            >
              Adjust the search or filters.
            </app-page-state>
          } @else {
            <ul class="space-y-3" data-testid="repository-list">
              @for (repo of visible(); track repo.id) {
                <li
                  class="rounded-lg border border-border bg-card p-4"
                  [attr.data-repo]="repo.fullName"
                >
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="min-w-0 space-y-1">
                      <div class="flex flex-wrap items-center gap-2">
                        <a
                          [routerLink]="['/repositories', repo.id]"
                          class="truncate text-base font-semibold hover:text-primary"
                          >{{ repo.fullName }}</a
                        >
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
                </li>
              }
            </ul>
          }
        }
      }
    </div>
  `,
})
export default class RepositoriesPage {
  readonly #api = inject(RadarApi);
  protected readonly repositories = new Remote<{
    repositories: RepositoryDto[];
  }>(() => this.#api.repositories());

  /** `?ci=failure`, bound from the URL (links from the Overview totals). */
  readonly ci = input<string>();

  protected readonly field = FIELD;
  protected readonly filter = signal<RepositoryFilter>(
    DEFAULT_REPOSITORY_FILTER,
  );
  readonly #ciChosen = signal(false);

  protected readonly effectiveFilter = computed<RepositoryFilter>(() => {
    const current = this.filter();
    const fromUrl = this.ci();
    if (!this.#ciChosen() && fromUrl && CI_VALUES.includes(fromUrl)) {
      return { ...current, ci: fromUrl as CiState };
    }
    return current;
  });

  protected readonly visible = computed(() =>
    filterRepositories(
      this.repositories.data()?.repositories ?? [],
      this.effectiveFilter(),
    ),
  );

  protected readonly sha = shortSha;
  protected readonly ago = (iso: string | null) => timeAgo(iso);

  constructor() {
    void this.repositories.load();
  }

  protected patch(change: Partial<RepositoryFilter>): void {
    this.filter.set({ ...this.effectiveFilter(), ...change });
  }

  protected setCi(value: CiState | 'all'): void {
    this.#ciChosen.set(true);
    this.patch({ ci: value });
  }
}
