import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import {
  LIMITS,
  RUN_REASON_LABEL,
  RUN_STATUS_LABEL,
} from '../../shared/automation';
import type { AutomationDetailDto } from '../../shared/dto';
import { ApiError } from '../radar/api';
import { shortSha, timeAgo } from '../radar/format';
import { RadarApi } from '../radar/radar-api.service';
import { Remote } from '../radar/remote';
import { AutomationStateComponent } from './automation-state.component';
import { PageStateComponent } from './page-state.component';
import { PreparePromptComponent } from './prepare-prompt.component';

/**
 * The settings panel of one repository's automation: the single recipe, its CI
 * requirement, settling time and cooldown, an optional ChatGPT link, manual
 * preparation, and the recent history. Saving writes only this user's rule.
 */
@Component({
  selector: 'app-automation-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    LucideAngularModule,
    AutomationStateComponent,
    PageStateComponent,
    PreparePromptComponent,
  ],
  template: `
    <section
      class="space-y-5 rounded-lg border border-border bg-card p-4"
      aria-labelledby="panel-heading"
      data-testid="automation-panel"
    >
      @if (detail.loading()) {
        <app-page-state kind="loading" />
      } @else if (detail.status() === 'error') {
        <app-page-state
          kind="error"
          [message]="detail.error() ?? ''"
          (retry)="detail.load()"
        />
      } @else if (detail.data(); as data) {
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 id="panel-heading" class="truncate text-lg font-semibold">
              {{ data.repository.fullName }}
            </h2>
            <p class="text-sm text-muted-foreground">
              Watches the default branch
              <code>{{ data.repository.defaultBranch }}</code
              >.
              <a
                [routerLink]="['/repositories', data.repository.id]"
                class="text-primary hover:underline"
                >Repository details</a
              >
            </p>
          </div>
          <div class="flex items-center gap-2">
            @if (data.rule; as rule) {
              <app-automation-state [state]="rule.state" />
            }
            <button
              type="button"
              class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-muted"
              aria-label="Close settings"
              (click)="closed.emit()"
              data-testid="panel-close"
            >
              <lucide-icon name="x" class="h-4 w-4" />
            </button>
          </div>
        </div>

        @if (!data.repository.followed) {
          <p
            class="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm"
            role="status"
          >
            You do not follow this repository, so its automation cannot run.
            Follow it from Repositories → Manage repositories first. Your
            settings are kept.
          </p>
        }

        <form class="space-y-5" (submit)="save($event)" data-testid="rule-form">
          <label class="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              class="mt-1 h-4 w-4"
              [checked]="enabled()"
              (change)="enabled.set($any($event.target).checked)"
              data-testid="rule-enabled"
            />
            <span>
              <span class="font-medium"
                >Prepare a development prompt automatically</span
              >
              <span class="block text-muted-foreground">
                When this repository’s default branch changes and the CI
                requirement below passes for that exact commit, DevRadar
                prepares a prompt in your Prompt Inbox. No AI model is called.
              </span>
            </span>
          </label>

          <fieldset class="space-y-2">
            <legend class="text-sm font-medium">CI requirement</legend>
            <label class="flex items-start gap-3 text-sm">
              <input
                type="radio"
                name="policy"
                class="mt-1"
                [checked]="policy() === 'all_workflows'"
                (change)="policy.set('all_workflows')"
                data-testid="policy-all"
              />
              <span>
                Every workflow that runs for the commit must succeed
                <span class="block text-muted-foreground">
                  A workflow that has not started yet is invisible to this
                  option; choose required workflows for a strict gate.
                </span>
              </span>
            </label>
            <label class="flex items-start gap-3 text-sm">
              <input
                type="radio"
                name="policy"
                class="mt-1"
                [checked]="policy() === 'required_workflows'"
                (change)="policy.set('required_workflows')"
                data-testid="policy-required"
              />
              <span>Only the workflows I select must succeed</span>
            </label>
            @if (policy() === 'required_workflows') {
              @if (data.workflows.length === 0) {
                <p class="pl-7 text-sm text-muted-foreground">
                  DevRadar has not seen any workflow run on this repository yet,
                  so there is nothing to select.
                </p>
              } @else {
                <ul class="space-y-1 pl-7" data-testid="workflow-list">
                  @for (workflow of data.workflows; track workflow.id) {
                    <li>
                      <label class="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          class="h-4 w-4"
                          [checked]="required().has(workflow.id)"
                          (change)="toggleWorkflow(workflow.id)"
                        />
                        {{ workflow.name }}
                      </label>
                    </li>
                  }
                </ul>
              }
            }
          </fieldset>

          <div class="grid gap-4 sm:grid-cols-2">
            <label class="flex flex-col gap-1 text-sm font-medium">
              Settling time (seconds)
              <input
                type="number"
                class="h-9 rounded-md border border-border bg-background px-3 text-sm font-normal"
                [min]="limits.settleSeconds.min"
                [max]="limits.settleSeconds.max"
                [value]="settle()"
                (input)="settle.set(+$any($event.target).value)"
                data-testid="rule-settle"
              />
              <span class="text-xs font-normal text-muted-foreground"
                >Wait after a push before checking CI, so late webhooks are not
                mistaken for success.</span
              >
            </label>
            <label class="flex flex-col gap-1 text-sm font-medium">
              Cooldown (minutes)
              <input
                type="number"
                class="h-9 rounded-md border border-border bg-background px-3 text-sm font-normal"
                [min]="limits.cooldownMinutes.min"
                [max]="limits.cooldownMinutes.max"
                [value]="cooldown()"
                (input)="cooldown.set(+$any($event.target).value)"
                data-testid="rule-cooldown"
              />
              <span class="text-xs font-normal text-muted-foreground"
                >Minimum time between two automatic preparations. 0 =
                none.</span
              >
            </label>
          </div>

          <label class="flex flex-col gap-1 text-sm font-medium">
            ChatGPT conversation link (optional)
            <input
              type="url"
              class="h-9 rounded-md border border-border bg-background px-3 text-sm font-normal"
              placeholder="https://chatgpt.com/c/…"
              [value]="chatgpt()"
              (input)="chatgpt.set($any($event.target).value)"
              data-testid="rule-chatgpt"
            />
            <span class="text-xs font-normal text-muted-foreground"
              >Adds an “Open ChatGPT conversation” link next to Copy prompt. It
              only opens the conversation; DevRadar never sends anything to
              it.</span
            >
          </label>

          @if (formError(); as message) {
            <p
              class="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-300"
              role="alert"
              data-testid="rule-error"
            >
              {{ message }}
            </p>
          }

          <div class="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              class="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
              [disabled]="saving()"
              data-testid="rule-save"
            >
              @if (saving()) {
                <lucide-icon name="loader" class="h-4 w-4 animate-spin" />
              }
              Save automation
            </button>
            @if (saved()) {
              <span
                class="text-sm text-muted-foreground"
                role="status"
                data-testid="rule-saved"
                >Saved.</span
              >
            }
          </div>
        </form>

        <div class="space-y-2 border-t border-border pt-4">
          <h3 class="text-sm font-semibold">Prepare a prompt now</h3>
          <p class="text-sm text-muted-foreground">
            Builds the same contextual prompt for the current head of
            <code>{{ data.repository.defaultBranch }}</code> on demand. It does
            not need the automation to be enabled.
          </p>
          @if (data.githubConfigured) {
            <app-prepare-prompt
              [repositoryId]="data.repository.id"
              (prepared)="detail.load(); changed.emit()"
            />
          } @else {
            <p class="text-sm text-muted-foreground">
              The GitHub App is not configured on this deployment, so prompts
              cannot be prepared. See Settings.
            </p>
          }
        </div>

        <div class="space-y-2 border-t border-border pt-4">
          <h3 class="text-sm font-semibold">Recent history</h3>
          @if (data.runs.length === 0) {
            <p
              class="text-sm text-muted-foreground"
              data-testid="history-empty"
            >
              Nothing has run for this repository yet. When the default branch
              changes, each attempt appears here with its outcome.
            </p>
          } @else {
            <ul class="divide-y divide-border" data-testid="history">
              @for (run of data.runs; track run.id) {
                <li
                  class="space-y-0.5 py-2 text-sm"
                  [attr.data-run-status]="run.status"
                >
                  <div
                    class="flex flex-wrap items-baseline justify-between gap-2"
                  >
                    <span class="font-medium">
                      {{ statusLabel(run.status) }} ·
                      {{ run.trigger === 'manual' ? 'Manual' : 'Automatic' }}
                      @if (run.ciBypassed) {
                        <span class="text-muted-foreground">
                          (CI bypassed)</span
                        >
                      }
                      · <code>{{ sha(run.sha) }}</code>
                    </span>
                    <time
                      class="text-xs text-muted-foreground"
                      [attr.datetime]="run.createdAt"
                      >{{ ago(run.createdAt) }}</time
                    >
                  </div>
                  <p class="text-muted-foreground">
                    {{ run.detail ?? reasonLabel(run.reason) }}
                    @if (run.promptId) {
                      <a
                        [routerLink]="['/prompts', run.promptId]"
                        class="text-primary hover:underline"
                        >Open prompt</a
                      >
                    }
                  </p>
                </li>
              }
            </ul>
          }
        </div>
      }
    </section>
  `,
})
export class AutomationPanelComponent {
  readonly #api = inject(RadarApi);

  readonly repositoryId = input.required<number>();
  /** Rules changed (saved or a prompt prepared): the list should refresh. */
  readonly changed = output<void>();
  readonly closed = output<void>();

  protected readonly limits = LIMITS;
  protected readonly detail = new Remote<AutomationDetailDto>(() =>
    this.#api.automation(this.repositoryId()),
  );

  protected readonly enabled = signal(false);
  protected readonly policy = signal<'all_workflows' | 'required_workflows'>(
    'all_workflows',
  );
  protected readonly required = signal<ReadonlySet<number>>(new Set());
  protected readonly settle = signal<number>(LIMITS.settleSeconds.default);
  protected readonly cooldown = signal<number>(LIMITS.cooldownMinutes.default);
  protected readonly chatgpt = signal('');
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly sha = shortSha;
  protected readonly ago = (iso: string | null) => timeAgo(iso);
  protected readonly statusLabel = (s: keyof typeof RUN_STATUS_LABEL) =>
    RUN_STATUS_LABEL[s];
  protected readonly reasonLabel = (r: keyof typeof RUN_REASON_LABEL | null) =>
    r ? RUN_REASON_LABEL[r] : '';

  constructor() {
    effect(() => {
      this.repositoryId();
      this.saved.set(false);
      this.formError.set(null);
      void this.detail.load();
    });
    effect(() => {
      const rule = this.detail.data()?.rule;
      this.enabled.set(rule?.enabled ?? false);
      this.policy.set(rule?.ciPolicy ?? 'all_workflows');
      this.required.set(new Set(rule?.requiredWorkflowIds ?? []));
      this.settle.set(rule?.settleSeconds ?? LIMITS.settleSeconds.default);
      this.cooldown.set(
        rule?.cooldownMinutes ?? LIMITS.cooldownMinutes.default,
      );
      this.chatgpt.set(rule?.chatgptUrl ?? '');
    });
  }

  protected toggleWorkflow(id: number): void {
    const next = new Set(this.required());
    if (!next.delete(id)) next.add(id);
    this.required.set(next);
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    if (this.saving()) return;
    this.saving.set(true);
    this.saved.set(false);
    this.formError.set(null);
    try {
      await this.#api.saveAutomation(this.repositoryId(), {
        enabled: this.enabled(),
        ciPolicy: this.policy(),
        requiredWorkflowIds:
          this.policy() === 'required_workflows' ? [...this.required()] : [],
        settleSeconds: this.settle(),
        cooldownMinutes: this.cooldown(),
        chatgptUrl: this.chatgpt().trim() || null,
      });
      this.saved.set(true);
      this.changed.emit();
      await this.detail.load();
    } catch (error) {
      this.formError.set(
        error instanceof ApiError ? error.message : 'Something went wrong.',
      );
    } finally {
      this.saving.set(false);
    }
  }
}
