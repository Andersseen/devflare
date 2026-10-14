import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { RUN_REASON_LABEL, RUN_STATUS_LABEL } from '../../../shared/automation';
import type { CiState } from '../../../shared/ci-state';
import type { PromptDetailDto } from '../../../shared/dto';
import { CiBadgeComponent } from '../../components/ci-badge.component';
import { PageStateComponent } from '../../components/page-state.component';
import { ApiError } from '../../radar/api';
import { copyText } from '../../radar/clipboard';
import { shortSha, timeAgo } from '../../radar/format';
import { RadarApi } from '../../radar/radar-api.service';
import { Remote } from '../../radar/remote';

@Component({
  selector: 'app-prompt-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    LucideAngularModule,
    CiBadgeComponent,
    PageStateComponent,
  ],
  template: `
    <div class="space-y-6">
      <a
        routerLink="/prompts"
        class="text-sm text-muted-foreground hover:text-primary"
      >
        ← Prompt Inbox
      </a>

      @if (detail.loading()) {
        <h1 class="text-3xl font-bold tracking-tight">Prompt</h1>
        <app-page-state kind="loading" />
      } @else if (detail.status() === 'error') {
        <h1 class="text-3xl font-bold tracking-tight">Prompt</h1>
        <app-page-state
          kind="error"
          [message]="detail.error() ?? ''"
          (retry)="detail.load()"
        />
      } @else if (detail.data(); as data) {
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0 space-y-1">
            <h1 class="truncate text-3xl font-bold tracking-tight">
              {{ data.repositoryFullName }}
            </h1>
            <p class="text-muted-foreground">{{ data.summary }}</p>
            <p class="text-sm text-muted-foreground">
              <code>{{ data.branch }}</code> ·
              <a
                [href]="data.commitUrl"
                target="_blank"
                rel="noreferrer"
                class="hover:text-primary"
                ><code>{{ sha(data.sha) }}</code></a
              >
              · prepared {{ ago(data.createdAt) }}
              @if (data.revision > 1) {
                · revision {{ data.revision }}
              }
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2 text-xs">
            <span
              class="rounded-full border border-border px-2 py-0.5 font-medium"
            >
              {{ data.trigger === 'manual' ? 'Manual' : 'Automatic' }}
            </span>
            @if (data.ciBypassed) {
              <span
                class="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-medium"
                >CI bypassed</span
              >
            }
            <app-ci-badge [state]="ci(data)" />
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            (click)="copy(data.prompt)"
            data-testid="copy-prompt"
          >
            <lucide-icon [name]="copied() ? 'check' : 'copy'" class="h-4 w-4" />
            {{ copied() ? 'Copied' : 'Copy prompt' }}
          </button>
          @if (data.chatgptUrl; as url) {
            <a
              [href]="url"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-muted"
              data-testid="open-chatgpt"
            >
              <lucide-icon name="message-square" class="h-4 w-4" />
              Open ChatGPT conversation
            </a>
          }
          <a
            [href]="data.repositoryUrl"
            target="_blank"
            rel="noreferrer"
            class="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-muted"
          >
            Open repository
            <lucide-icon name="external-link" class="h-3.5 w-3.5" />
          </a>
          @if (data.status === 'dismissed') {
            <button
              type="button"
              class="h-9 rounded-md px-3 text-sm text-muted-foreground hover:bg-muted"
              (click)="mark('read')"
            >
              Restore to inbox
            </button>
          } @else {
            <button
              type="button"
              class="h-9 rounded-md px-3 text-sm text-muted-foreground hover:bg-muted"
              (click)="mark('dismissed')"
              data-testid="dismiss"
            >
              Dismiss
            </button>
          }
        </div>
        @if (copyFailed()) {
          <p class="text-sm text-red-700 dark:text-red-300" role="alert">
            Your browser blocked copying. Select the text below and copy it
            manually.
          </p>
        }
        @if (error(); as message) {
          <p class="text-sm text-red-700 dark:text-red-300" role="alert">
            {{ message }}
          </p>
        }
        <p class="text-xs text-muted-foreground">
          The ChatGPT link only opens your conversation — DevRadar cannot insert
          or send text into it. Paste the prompt yourself.
        </p>

        <section class="space-y-2" aria-labelledby="prompt-heading">
          <h2 id="prompt-heading" class="text-lg font-semibold">Prompt</h2>
          <pre
            class="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/30 p-4 text-sm"
            data-testid="prompt-text"
            tabindex="0"
            >{{ data.prompt }}</pre
          >
        </section>

        <div class="grid gap-6 lg:grid-cols-2">
          <section
            class="space-y-2 rounded-lg border border-border bg-card p-4"
            aria-labelledby="context-heading"
          >
            <h2 id="context-heading" class="text-lg font-semibold">
              Collected context
            </h2>
            <dl class="space-y-1 text-sm" data-testid="context-summary">
              <div>
                <dt class="inline font-medium">CI:</dt>
                <dd class="inline text-muted-foreground">
                  {{ data.context.ci.detail }}
                </dd>
              </div>
              <div>
                <dt class="inline font-medium">Latest merged PR:</dt>
                <dd class="inline text-muted-foreground">
                  @if (data.context.latestPullRequest; as pr) {
                    <a
                      [href]="pr.url"
                      target="_blank"
                      rel="noreferrer"
                      class="hover:text-primary"
                      >#{{ pr.number }} {{ pr.title }}</a
                    >
                  } @else {
                    none found
                  }
                </dd>
              </div>
              <div>
                <dt class="inline font-medium">Recent commits:</dt>
                <dd class="inline text-muted-foreground">
                  {{ data.context.recentCommits.length }}
                </dd>
              </div>
              <div>
                <dt class="inline font-medium">Files changed:</dt>
                <dd class="inline text-muted-foreground">
                  {{ data.context.changedFiles?.total ?? 'unknown' }}
                </dd>
              </div>
              <div>
                <dt class="inline font-medium">Documents read:</dt>
                <dd class="inline text-muted-foreground">
                  @if (data.context.documents.length === 0) {
                    none
                  } @else {
                    @for (
                      doc of data.context.documents;
                      track doc.path;
                      let last = $last
                    ) {
                      {{ doc.path }}{{ doc.truncated ? ' (excerpt)' : ''
                      }}{{ last ? '' : ',' }}
                    }
                  }
                </dd>
              </div>
            </dl>
            @if (data.context.missing.length > 0) {
              <div>
                <h3 class="text-sm font-medium">Missing from the snapshot</h3>
                <ul
                  class="list-disc pl-5 text-sm text-muted-foreground"
                  data-testid="context-missing"
                >
                  @for (item of data.context.missing; track item.what) {
                    <li>{{ item.what }} — {{ item.reason }}</li>
                  }
                </ul>
              </div>
            }
          </section>

          <section
            class="space-y-2 rounded-lg border border-border bg-card p-4"
            aria-labelledby="trigger-heading"
          >
            <h2 id="trigger-heading" class="text-lg font-semibold">
              Trigger and history
            </h2>
            @if (data.run; as run) {
              <dl class="space-y-1 text-sm">
                <div>
                  <dt class="inline font-medium">Trigger:</dt>
                  <dd class="inline text-muted-foreground">
                    {{
                      run.trigger === 'manual'
                        ? 'Manual request'
                        : 'Default branch updated and CI passed'
                    }}
                    @if (run.ciBypassed) {
                      (CI check bypassed by you)
                    }
                  </dd>
                </div>
                <div>
                  <dt class="inline font-medium">Run:</dt>
                  <dd class="inline text-muted-foreground">
                    {{ statusLabel(run.status) }}
                    @if (run.reason) {
                      — {{ reasonLabel(run.reason) }}
                    }
                    · {{ ago(run.createdAt) }}
                    @if (run.attempts > 0) {
                      · {{ run.attempts }} retr{{
                        run.attempts === 1 ? 'y' : 'ies'
                      }}
                    }
                  </dd>
                </div>
              </dl>
            } @else {
              <p class="text-sm text-muted-foreground">
                The run record has expired; the prompt itself is kept.
              </p>
            }
          </section>
        </div>
      }
    </div>
  `,
})
export default class PromptDetailPage {
  readonly #api = inject(RadarApi);

  /** Route param `[id]`, bound by withComponentInputBinding(). */
  readonly id = input.required<string>();

  protected readonly detail = new Remote<PromptDetailDto>(() =>
    this.#api.prompt(this.id()),
  );
  protected readonly copied = signal(false);
  protected readonly copyFailed = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly valid = computed(() => /^[0-9a-f-]{36}$/i.test(this.id()));
  protected readonly sha = shortSha;
  protected readonly ago = (iso: string | null) => timeAgo(iso);
  protected readonly statusLabel = (s: keyof typeof RUN_STATUS_LABEL) =>
    RUN_STATUS_LABEL[s];
  protected readonly reasonLabel = (r: keyof typeof RUN_REASON_LABEL) =>
    RUN_REASON_LABEL[r];

  constructor() {
    effect(() => {
      if (!this.valid()) return;
      void this.detail.load().then(() => {
        // Opening a prompt reads it.
        if (this.detail.data()?.status === 'unread') {
          void this.#api
            .setPromptStatus(this.id(), 'read')
            .catch(() => undefined);
        }
      });
    });
  }

  protected ci(data: PromptDetailDto): CiState {
    return (
      ['success', 'failure', 'pending', 'none', 'unknown'].includes(
        data.ciState,
      )
        ? data.ciState
        : 'unknown'
    ) as CiState;
  }

  protected async copy(text: string): Promise<void> {
    this.copyFailed.set(false);
    if (await copyText(text)) {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } else {
      this.copyFailed.set(true);
    }
  }

  protected async mark(status: 'read' | 'dismissed'): Promise<void> {
    this.error.set(null);
    try {
      await this.#api.setPromptStatus(this.id(), status);
      await this.detail.load();
    } catch (error) {
      this.error.set(
        error instanceof ApiError ? error.message : 'Something went wrong.',
      );
    }
  }
}
