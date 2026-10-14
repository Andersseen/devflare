import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import type { CiState } from '../../../shared/ci-state';
import type { PromptListDto, PromptSummaryDto } from '../../../shared/dto';
import { CiBadgeComponent } from '../../components/ci-badge.component';
import { PageStateComponent } from '../../components/page-state.component';
import { ApiError } from '../../radar/api';
import { copyText } from '../../radar/clipboard';
import { shortSha, timeAgo } from '../../radar/format';
import { RadarApi } from '../../radar/radar-api.service';
import { Remote } from '../../radar/remote';

type StatusFilter = 'active' | 'unread' | 'read' | 'dismissed';

const CI_STATES: readonly string[] = [
  'success',
  'failure',
  'pending',
  'none',
  'unknown',
];

@Component({
  selector: 'app-prompt-inbox-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    LucideAngularModule,
    CiBadgeComponent,
    PageStateComponent,
  ],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">Prompt Inbox</h1>
        <p class="mt-1 text-muted-foreground">
          Contextual prompts DevRadar prepared from a bounded snapshot of your
          repositories — paste one into ChatGPT or another planning assistant.
          They are deterministic templates, not AI recommendations.
        </p>
      </div>

      <div class="flex flex-wrap items-end gap-3" data-testid="inbox-filters">
        <label
          class="flex flex-col gap-1 text-xs font-medium text-muted-foreground"
        >
          Repository
          <select
            class="h-9 rounded-md border border-border bg-background px-3 text-sm"
            [value]="repositoryId()"
            (change)="setRepository($any($event.target).value)"
            data-testid="filter-repository"
          >
            <option value="">All repositories</option>
            @for (repo of repositories(); track repo.id) {
              <option [value]="repo.id">{{ repo.name }}</option>
            }
          </select>
        </label>
        <label
          class="flex flex-col gap-1 text-xs font-medium text-muted-foreground"
        >
          Status
          <select
            class="h-9 rounded-md border border-border bg-background px-3 text-sm"
            [value]="status()"
            (change)="setStatus($any($event.target).value)"
            data-testid="filter-status"
          >
            <option value="active">Inbox (unread and read)</option>
            <option value="unread">Unread</option>
            <option value="read">Read</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </label>
      </div>

      @if (error(); as message) {
        <p
          class="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-300"
          role="alert"
        >
          {{ message }}
        </p>
      }

      @if (list.loading()) {
        <app-page-state kind="loading" />
      } @else if (list.status() === 'error') {
        <app-page-state
          kind="error"
          [message]="list.error() ?? ''"
          (retry)="list.load()"
        />
      } @else if (list.data(); as data) {
        @if (data.prompts.length === 0) {
          <app-page-state kind="empty" icon="inbox" title="No prompts here">
            @if (repositoryId() || status() !== 'active') {
              Nothing matches these filters.
            } @else {
              Prompts appear when an enabled
              <a routerLink="/automations" class="text-primary hover:underline"
                >automation</a
              >
              finds a green default-branch commit, or when you prepare one by
              hand from an automation or a repository page.
            }
          </app-page-state>
        } @else {
          <ul class="space-y-3" data-testid="prompt-list">
            @for (item of data.prompts; track item.id) {
              <li
                class="space-y-2 rounded-lg border border-border bg-card p-4"
                [class.border-primary]="item.status === 'unread'"
                [attr.data-prompt]="item.id"
                [attr.data-prompt-status]="item.status"
              >
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="truncate font-medium">
                      <a
                        [routerLink]="['/prompts', item.id]"
                        class="hover:text-primary"
                        >{{ item.repositoryFullName }}</a
                      >
                      <span class="text-muted-foreground">
                        ·
                        <code>{{ sha(item.sha) }}</code>
                        @if (item.revision > 1) {
                          · revision {{ item.revision }}
                        }
                      </span>
                    </p>
                    <p class="text-sm text-muted-foreground">
                      {{ item.summary }}
                    </p>
                  </div>
                  <time
                    class="shrink-0 text-xs text-muted-foreground"
                    [attr.datetime]="item.createdAt"
                    >{{ ago(item.createdAt) }}</time
                  >
                </div>

                <div class="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    class="rounded-full border border-border px-2 py-0.5 font-medium"
                  >
                    {{ item.trigger === 'manual' ? 'Manual' : 'Automatic' }}
                  </span>
                  @if (item.ciBypassed) {
                    <span
                      class="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-medium"
                      >CI bypassed</span
                    >
                  }
                  <app-ci-badge [state]="ci(item)" />
                  <span
                    class="rounded-full border border-border px-2 py-0.5 font-medium"
                  >
                    {{ statusLabel(item.status) }}
                  </span>
                </div>

                <div class="flex flex-wrap items-center gap-2">
                  <a
                    [routerLink]="['/prompts', item.id]"
                    class="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm hover:bg-muted"
                    data-testid="view-prompt"
                    >View prompt</a
                  >
                  <button
                    type="button"
                    class="inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 text-sm hover:bg-muted"
                    (click)="copy(item)"
                    data-testid="copy-prompt"
                  >
                    <lucide-icon
                      [name]="copied() === item.id ? 'check' : 'copy'"
                      class="h-3.5 w-3.5"
                    />
                    {{ copied() === item.id ? 'Copied' : 'Copy prompt' }}
                  </button>
                  <a
                    [href]="repositoryUrl(item)"
                    target="_blank"
                    rel="noreferrer"
                    class="inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 text-sm hover:bg-muted"
                  >
                    Open repository
                    <lucide-icon name="external-link" class="h-3.5 w-3.5" />
                  </a>
                  @if (item.status === 'dismissed') {
                    <button
                      type="button"
                      class="h-8 rounded-md px-3 text-sm text-muted-foreground hover:bg-muted"
                      (click)="mark(item, 'read')"
                    >
                      Restore
                    </button>
                  } @else {
                    @if (item.status === 'unread') {
                      <button
                        type="button"
                        class="h-8 rounded-md px-3 text-sm text-muted-foreground hover:bg-muted"
                        (click)="mark(item, 'read')"
                        data-testid="mark-read"
                      >
                        Mark read
                      </button>
                    }
                    <button
                      type="button"
                      class="h-8 rounded-md px-3 text-sm text-muted-foreground hover:bg-muted"
                      (click)="mark(item, 'dismissed')"
                      data-testid="dismiss"
                    >
                      Dismiss
                    </button>
                  }
                </div>
              </li>
            }
          </ul>
        }
      }
    </div>
  `,
})
export default class PromptInboxPage {
  readonly #api = inject(RadarApi);

  protected readonly repositoryId = signal('');
  protected readonly status = signal<StatusFilter>('active');
  protected readonly copied = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly list = new Remote<PromptListDto>(() =>
    this.#api.prompts({
      repositoryId: Number(this.repositoryId()) || undefined,
      status: this.status(),
    }),
  );

  /** Repositories seen so far, so narrowing the list keeps the others selectable. */
  readonly #seen = signal<ReadonlyMap<number, string>>(new Map());
  protected readonly repositories = computed(() =>
    [...this.#seen()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  protected readonly sha = shortSha;
  protected readonly ago = (iso: string | null) => timeAgo(iso);

  constructor() {
    void this.reload();
  }

  protected async reload(): Promise<void> {
    await this.list.load();
    const seen = new Map(this.#seen());
    for (const p of this.list.data()?.prompts ?? []) {
      seen.set(p.repositoryId, p.repositoryFullName);
    }
    this.#seen.set(seen);
  }

  protected setRepository(value: string): void {
    this.repositoryId.set(value);
    void this.reload();
  }

  protected setStatus(value: StatusFilter): void {
    this.status.set(value);
    void this.reload();
  }

  protected ci(item: PromptSummaryDto): CiState {
    return CI_STATES.includes(item.ciState)
      ? (item.ciState as CiState)
      : 'unknown';
  }

  protected statusLabel(status: PromptSummaryDto['status']): string {
    return status === 'unread'
      ? 'Unread'
      : status === 'read'
        ? 'Read'
        : 'Dismissed';
  }

  protected repositoryUrl(item: PromptSummaryDto): string {
    return `https://github.com/${item.repositoryFullName}`;
  }

  protected async copy(item: PromptSummaryDto): Promise<void> {
    this.error.set(null);
    try {
      const detail = await this.#api.prompt(item.id);
      if (await copyText(detail.prompt)) {
        this.copied.set(item.id);
        setTimeout(() => this.copied.set(null), 2000);
      } else {
        this.error.set(
          'Your browser blocked copying. Open the prompt and select the text.',
        );
      }
    } catch (error) {
      this.error.set(
        error instanceof ApiError ? error.message : 'Something went wrong.',
      );
    }
  }

  protected async mark(
    item: PromptSummaryDto,
    status: 'read' | 'dismissed',
  ): Promise<void> {
    this.error.set(null);
    try {
      await this.#api.setPromptStatus(item.id, status);
      await this.reload();
    } catch (error) {
      this.error.set(
        error instanceof ApiError ? error.message : 'Something went wrong.',
      );
    }
  }
}
