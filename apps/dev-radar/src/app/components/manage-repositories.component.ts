import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import type { RepositoryDto } from '../../shared/dto';

/**
 * Manage repositories (spec 022): every repository the GitHub App can read,
 * searchable, with a checkbox for "follow". Following only changes what this
 * user's dashboard shows and counts — it never touches the GitHub App
 * installation or the synchronized data.
 *
 * Native checkboxes: labels, focus and Space-to-toggle come with the platform.
 * The selection is local until Save.
 */
@Component({
  selector: 'app-manage-repositories',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  template: `
    <section
      class="space-y-4 rounded-lg border border-border bg-card p-4"
      aria-labelledby="manage-heading"
      data-testid="manage-repositories"
    >
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="manage-heading" class="text-lg font-semibold">
            Manage repositories
          </h2>
          <p class="text-sm text-muted-foreground">
            {{ repositories().length }} available from the GitHub App ·
            <span data-testid="selected-count">{{ selected().size }}</span>
            followed. Unfollowed repositories stay synchronized and reachable;
            they just leave your dashboard and its totals.
          </p>
        </div>
      </div>

      <div class="flex flex-wrap items-end gap-3">
        <label
          class="flex min-w-48 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground"
        >
          Search available repositories
          <input
            type="search"
            class="h-9 rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Name or description"
            [value]="query()"
            (input)="query.set($any($event.target).value)"
            data-testid="manage-search"
          />
        </label>
        <label
          class="flex flex-col gap-1 text-xs font-medium text-muted-foreground"
        >
          Show
          <select
            class="h-9 rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            [value]="show()"
            (change)="show.set($any($event.target).value)"
          >
            <option value="all">All</option>
            <option value="followed">Followed</option>
            <option value="unfollowed">Not followed</option>
          </select>
        </label>
        <button
          type="button"
          class="h-9 rounded-md border border-border px-3 text-sm hover:bg-muted"
          (click)="setShown(true)"
          data-testid="select-shown"
        >
          Select {{ shown().length }} shown
        </button>
        <button
          type="button"
          class="h-9 rounded-md border border-border px-3 text-sm hover:bg-muted"
          (click)="setShown(false)"
        >
          Clear shown
        </button>
      </div>

      <ul
        class="max-h-96 divide-y divide-border overflow-y-auto rounded-md border border-border"
        data-testid="manage-list"
      >
        @for (repo of shown(); track repo.id) {
          <li>
            <label
              class="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-muted/50"
            >
              <input
                type="checkbox"
                class="mt-1"
                [checked]="selected().has(repo.id)"
                (change)="toggle(repo.id)"
                [attr.data-repo]="repo.fullName"
              />
              <span class="min-w-0">
                <span class="block truncate text-sm font-medium">{{
                  repo.fullName
                }}</span>
                <span class="block truncate text-xs text-muted-foreground">
                  {{ repo.private ? 'Private' : 'Public'
                  }}{{ repo.archived ? ' · Archived' : ''
                  }}{{ repo.description ? ' · ' + repo.description : '' }}
                </span>
              </span>
            </label>
          </li>
        } @empty {
          <li class="px-3 py-6 text-center text-sm text-muted-foreground">
            No repository matches.
          </li>
        }
      </ul>

      <div class="flex flex-wrap items-center justify-end gap-2">
        @if (error()) {
          <p
            class="mr-auto text-sm text-red-700 dark:text-red-300"
            role="alert"
          >
            {{ error() }}
          </p>
        }
        <button
          type="button"
          class="h-9 rounded-md border border-border px-3 text-sm hover:bg-muted"
          [disabled]="saving()"
          (click)="cancelled.emit()"
        >
          Cancel
        </button>
        <button
          type="button"
          class="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          [disabled]="saving() || !dirty()"
          (click)="submit()"
          data-testid="manage-save"
        >
          @if (saving()) {
            <lucide-icon name="loader" class="h-4 w-4 animate-spin" />
          }
          Save selection
        </button>
      </div>
    </section>
  `,
})
export class ManageRepositoriesComponent {
  readonly repositories = input.required<readonly RepositoryDto[]>();
  readonly saving = input(false);
  readonly error = input<string | null>(null);

  readonly saved = output<number[]>();
  readonly cancelled = output<void>();

  protected readonly query = signal('');
  protected readonly show = signal<'all' | 'followed' | 'unfollowed'>('all');
  readonly #choice = signal<ReadonlySet<number> | null>(null);

  /** Starts from what is followed now; local edits replace it. */
  protected readonly selected = computed<ReadonlySet<number>>(
    () =>
      this.#choice() ??
      new Set(
        this.repositories()
          .filter((r) => r.followed)
          .map((r) => r.id),
      ),
  );

  protected readonly dirty = computed(() => {
    const now = new Set(
      this.repositories()
        .filter((r) => r.followed)
        .map((r) => r.id),
    );
    const next = this.selected();
    return now.size !== next.size || [...next].some((id) => !now.has(id));
  });

  protected readonly shown = computed(() => {
    const query = this.query().trim().toLowerCase();
    const show = this.show();
    return this.repositories().filter((repo) => {
      // By the saved state, so a row does not vanish while its box is toggled.
      if (show === 'followed' && !repo.followed) return false;
      if (show === 'unfollowed' && repo.followed) return false;
      return (
        !query ||
        repo.fullName.toLowerCase().includes(query) ||
        (repo.description ?? '').toLowerCase().includes(query)
      );
    });
  });

  protected submit(): void {
    this.saved.emit([...this.selected()]);
  }

  protected toggle(id: number): void {
    const next = new Set(this.selected());
    if (!next.delete(id)) next.add(id);
    this.#choice.set(next);
  }

  protected setShown(value: boolean): void {
    const next = new Set(this.selected());
    for (const repo of this.shown()) {
      if (value) next.add(repo.id);
      else next.delete(repo.id);
    }
    this.#choice.set(next);
  }
}
