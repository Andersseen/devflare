import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import type { PullRequestDto } from '../../shared/dto';
import { CiBadgeComponent } from '../components/ci-badge.component';
import { PageStateComponent } from '../components/page-state.component';
import {
  DEFAULT_PULL_REQUEST_FILTER,
  filterPullRequests,
  type PullRequestFilter,
} from '../radar/filters';
import { timeAgo } from '../radar/format';
import { RadarApi } from '../radar/radar-api.service';
import { Remote } from '../radar/remote';

const FIELD =
  'h-9 rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

@Component({
  selector: 'app-pull-requests-page',
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
        <h1 class="text-3xl font-bold tracking-tight">Pull Requests</h1>
        <p class="mt-1 text-muted-foreground">
          Open pull requests across all monitored repositories.
        </p>
      </div>

      @if (pulls.loading()) {
        <app-page-state kind="loading" />
      } @else if (pulls.status() === 'error') {
        <app-page-state
          kind="error"
          [message]="pulls.error() ?? ''"
          (retry)="pulls.load()"
        />
      } @else if (pulls.data(); as data) {
        @if (data.pullRequests.length === 0) {
          <app-page-state
            kind="empty"
            icon="git-pull-request"
            title="No open pull requests"
          >
            Either nothing is open, or no repository has been synced yet.
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
                placeholder="Title, repository, author or #number"
                [ngModel]="filter().query"
                (ngModelChange)="patch({ query: $event })"
                name="query"
                aria-label="Search pull requests"
              />
            </label>
            <label
              class="flex flex-col gap-1 text-xs font-medium text-muted-foreground"
            >
              Repository
              <select
                [class]="field"
                [ngModel]="filter().repositoryId"
                (ngModelChange)="patch({ repositoryId: $event })"
                name="repo"
                aria-label="Filter by repository"
              >
                <option value="all">All</option>
                @for (repo of repositoryOptions(); track repo.id) {
                  <option [ngValue]="repo.id">{{ repo.name }}</option>
                }
              </select>
            </label>
            <label class="flex items-center gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                [ngModel]="filter().hideDrafts"
                (ngModelChange)="patch({ hideDrafts: $event })"
                name="drafts"
              />
              Hide drafts
            </label>
            <label class="flex items-center gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                [ngModel]="filter().releaseOnly"
                (ngModelChange)="patch({ releaseOnly: $event })"
                name="release"
              />
              Release PRs only
            </label>
          </form>

          <p class="text-sm text-muted-foreground" aria-live="polite">
            {{ visible().length }} of {{ data.pullRequests.length }} pull
            requests
          </p>

          @if (visible().length === 0) {
            <app-page-state
              kind="empty"
              icon="search"
              title="No pull requests match"
            >
              Adjust the search or filters.
            </app-page-state>
          } @else {
            <ul class="space-y-3" data-testid="pr-list">
              @for (pr of visible(); track pr.id) {
                <li
                  class="rounded-lg border border-border bg-card p-4"
                  [attr.data-pr]="pr.repositoryFullName + '#' + pr.number"
                >
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="min-w-0 space-y-1">
                      <a
                        [href]="pr.htmlUrl"
                        target="_blank"
                        rel="noreferrer"
                        class="font-semibold hover:text-primary"
                        >#{{ pr.number }} {{ pr.title }}</a
                      >
                      <p class="text-sm text-muted-foreground">
                        <a
                          [routerLink]="['/repositories', pr.repositoryId]"
                          class="hover:text-primary"
                          >{{ pr.repositoryFullName }}</a
                        >
                        · {{ pr.author ?? 'unknown author' }} ·
                        {{ pr.headRef }} → {{ pr.baseRef }} · updated
                        {{ ago(pr.updatedAt) }}
                      </p>
                    </div>
                    <div class="flex flex-wrap items-center justify-end gap-2">
                      @if (pr.draft) {
                        <span
                          class="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
                          >Draft</span
                        >
                      }
                      @if (pr.releaseHint) {
                        <span
                          class="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                          [attr.title]="'Detected from ' + pr.releaseHint"
                          data-testid="release-badge"
                        >
                          <lucide-icon name="rocket" class="h-3 w-3" /> Release
                        </span>
                      }
                      <app-ci-badge [state]="pr.ci" />
                    </div>
                  </div>
                  @if (pr.labels.length > 0) {
                    <p class="mt-2 flex flex-wrap gap-1">
                      @for (label of pr.labels; track label) {
                        <span
                          class="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                          >{{ label }}</span
                        >
                      }
                    </p>
                  }
                </li>
              }
            </ul>
          }
        }
      }
    </div>
  `,
})
export default class PullRequestsPage {
  readonly #api = inject(RadarApi);
  protected readonly pulls = new Remote<{ pullRequests: PullRequestDto[] }>(
    () => this.#api.pullRequests(),
  );

  protected readonly field = FIELD;
  protected readonly filter = signal<PullRequestFilter>(
    DEFAULT_PULL_REQUEST_FILTER,
  );
  protected readonly ago = (iso: string | null) => timeAgo(iso);

  protected readonly visible = computed(() =>
    filterPullRequests(this.pulls.data()?.pullRequests ?? [], this.filter()),
  );

  protected readonly repositoryOptions = computed(() => {
    const seen = new Map<number, string>();
    for (const pr of this.pulls.data()?.pullRequests ?? []) {
      seen.set(pr.repositoryId, pr.repositoryFullName);
    }
    return [...seen].map(([id, name]) => ({ id, name }));
  });

  constructor() {
    void this.pulls.load();
  }

  protected patch(change: Partial<PullRequestFilter>): void {
    this.filter.set({ ...this.filter(), ...change });
  }
}
