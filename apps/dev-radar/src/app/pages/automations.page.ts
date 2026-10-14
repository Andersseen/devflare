import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { RUN_REASON_LABEL } from '../../shared/automation';
import type { AutomationsDto } from '../../shared/dto';
import { AutomationPanelComponent } from '../components/automation-panel.component';
import { AutomationStateComponent } from '../components/automation-state.component';
import { PageStateComponent } from '../components/page-state.component';
import { shortSha, timeAgo } from '../radar/format';
import { RadarApi } from '../radar/radar-api.service';
import { Remote } from '../radar/remote';

@Component({
  selector: 'app-automations-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    RouterLink,
    LucideAngularModule,
    AutomationPanelComponent,
    AutomationStateComponent,
    PageStateComponent,
  ],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">Automations</h1>
        <p class="mt-1 text-muted-foreground">
          One recipe per repository you follow: when the default branch changes
          and CI passes for that exact commit, DevRadar prepares a contextual
          development prompt in your
          <a routerLink="/prompts" class="text-primary hover:underline"
            >Prompt Inbox</a
          >. Opt-in, and no AI model is involved.
        </p>
      </div>

      @if (rules.loading()) {
        <app-page-state kind="loading" />
      } @else if (rules.status() === 'error') {
        <app-page-state
          kind="error"
          [message]="rules.error() ?? ''"
          (retry)="rules.load()"
        />
      } @else if (rules.data(); as data) {
        @if (!data.githubConfigured) {
          <p
            class="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm"
            role="status"
          >
            The GitHub App is not configured on this deployment: automations can
            be set up, but no prompt can be prepared until it is. See Settings.
          </p>
        }

        @if (selected(); as repositoryId) {
          <app-automation-panel
            [repositoryId]="repositoryId"
            (changed)="rules.load()"
            (closed)="selected.set(null)"
          />
        }

        <section class="space-y-3" aria-labelledby="active-heading">
          <h2 id="active-heading" class="text-lg font-semibold">
            Active automations ({{ active().length }})
          </h2>
          @if (active().length === 0) {
            <app-page-state
              kind="empty"
              icon="bot"
              title="No automation is enabled"
            >
              Pick a followed repository below and enable the recipe. Following
              a repository never starts an automation by itself.
            </app-page-state>
          } @else {
            <ul class="space-y-2" data-testid="active-automations">
              @for (rule of active(); track rule.repositoryId) {
                <ng-container
                  [ngTemplateOutlet]="row"
                  [ngTemplateOutletContext]="{ $implicit: rule }"
                />
              }
            </ul>
          }
        </section>

        @if (inactive().length > 0) {
          <section class="space-y-3" aria-labelledby="inactive-heading">
            <h2 id="inactive-heading" class="text-lg font-semibold">
              Disabled ({{ inactive().length }})
            </h2>
            <ul class="space-y-2" data-testid="inactive-automations">
              @for (rule of inactive(); track rule.repositoryId) {
                <ng-container
                  [ngTemplateOutlet]="row"
                  [ngTemplateOutletContext]="{ $implicit: rule }"
                />
              }
            </ul>
          </section>
        }

        <section class="space-y-3" aria-labelledby="eligible-heading">
          <h2 id="eligible-heading" class="text-lg font-semibold">
            Eligible repositories ({{ eligible().length }})
          </h2>
          <label
            class="flex max-w-md flex-col gap-1 text-xs font-medium text-muted-foreground"
          >
            Search your followed repositories
            <input
              type="search"
              class="h-9 rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Repository name"
              [value]="query()"
              (input)="query.set($any($event.target).value)"
              data-testid="automation-search"
            />
          </label>
          @if (data.eligible.length === 0) {
            <app-page-state
              kind="empty"
              icon="folder-git-2"
              title="Nothing left to set up"
            >
              Every followed repository already has an automation, or you follow
              none yet. Choose repositories in Repositories → Manage
              repositories.
            </app-page-state>
          } @else if (eligible().length === 0) {
            <p class="text-sm text-muted-foreground">
              No followed repository matches “{{ query() }}”.
            </p>
          } @else {
            <ul
              class="divide-y divide-border rounded-lg border border-border bg-card"
              data-testid="eligible-list"
            >
              @for (repo of eligible(); track repo.id) {
                <li
                  class="flex flex-wrap items-center justify-between gap-3 p-3"
                  [attr.data-eligible]="repo.fullName"
                >
                  <span class="min-w-0 truncate font-medium">{{
                    repo.fullName
                  }}</span>
                  <button
                    type="button"
                    class="inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 text-sm hover:bg-muted"
                    (click)="selected.set(repo.id)"
                    data-testid="configure-button"
                  >
                    Set up
                  </button>
                </li>
              }
            </ul>
          }
        </section>
      }
    </div>

    <ng-template #row let-rule>
      <li
        class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
        [attr.data-automation]="rule.repositoryFullName"
      >
        <div class="min-w-0 space-y-0.5">
          <p class="truncate font-medium">{{ rule.repositoryFullName }}</p>
          <p class="text-sm text-muted-foreground">
            @if (rule.latestRun; as run) {
              {{ run.detail ?? reasonLabel(run.reason) }} ·
              <code>{{ sha(run.sha) }}</code> · {{ ago(run.createdAt) }}
            } @else if (!rule.repositoryAvailable) {
              The repository is not available to DevRadar right now. Your
              settings are kept.
            } @else {
              Waiting for the next change on {{ rule.branch }}.
            }
          </p>
          @if (rule.lastPreparedAt) {
            <p class="text-xs text-muted-foreground">
              Last prepared {{ ago(rule.lastPreparedAt) }} for
              <code>{{ sha(rule.lastPreparedSha) }}</code>
            </p>
          }
        </div>
        <div class="flex items-center gap-2">
          <app-automation-state [state]="rule.state" />
          @if (rule.latestRun?.promptId; as promptId) {
            <a
              [routerLink]="['/prompts', promptId]"
              class="text-sm text-primary hover:underline"
              >Open prompt</a
            >
          }
          <button
            type="button"
            class="inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 text-sm hover:bg-muted"
            (click)="selected.set(rule.repositoryId)"
            data-testid="configure-button"
          >
            Configure
          </button>
        </div>
      </li>
    </ng-template>
  `,
})
export default class AutomationsPage {
  readonly #api = inject(RadarApi);

  /** `?repo=<id>` opens that repository's panel (linked from its detail page). */
  readonly repo = input<string>();

  protected readonly rules = new Remote<AutomationsDto>(() =>
    this.#api.automations(),
  );
  protected readonly selected = signal<number | null>(null);
  protected readonly query = signal('');

  /** The search narrows all three lists: it is "find a followed repository". */
  readonly #matches = (name: string) => {
    const q = this.query().trim().toLowerCase();
    return !q || name.toLowerCase().includes(q);
  };
  protected readonly active = computed(() =>
    (this.rules.data()?.rules ?? []).filter(
      (r) => r.enabled && r.followed && this.#matches(r.repositoryFullName),
    ),
  );
  protected readonly inactive = computed(() =>
    (this.rules.data()?.rules ?? []).filter(
      (r) => !(r.enabled && r.followed) && this.#matches(r.repositoryFullName),
    ),
  );
  protected readonly eligible = computed(() =>
    (this.rules.data()?.eligible ?? []).filter((r) =>
      this.#matches(r.fullName),
    ),
  );

  protected readonly sha = shortSha;
  protected readonly ago = (iso: string | null) => timeAgo(iso);
  protected readonly reasonLabel = (r: keyof typeof RUN_REASON_LABEL | null) =>
    r ? RUN_REASON_LABEL[r] : '';

  constructor() {
    void this.rules.load().then(() => {
      const wanted = Number(this.repo());
      if (Number.isSafeInteger(wanted) && wanted > 0) this.selected.set(wanted);
    });
  }
}
