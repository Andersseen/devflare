import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import {
  VoltCard,
  VoltCardContent,
  VoltCardHeader,
  VoltCardTitle,
} from '@voltui/components';
import { DOMAIN_EVENT_LABEL } from '../../../shared/domain-events';
import type { RepositoryDetailDto } from '../../../shared/dto';
import { CiBadgeComponent } from '../../components/ci-badge.component';
import { PageStateComponent } from '../../components/page-state.component';
import { shortSha, timeAgo } from '../../radar/format';
import { RadarApi } from '../../radar/radar-api.service';
import { Remote } from '../../radar/remote';

@Component({
  selector: 'app-repository-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    LucideAngularModule,
    VoltCard,
    VoltCardContent,
    VoltCardHeader,
    VoltCardTitle,
    CiBadgeComponent,
    PageStateComponent,
  ],
  template: `
    <div class="space-y-6">
      <a
        routerLink="/repositories"
        class="text-sm text-muted-foreground hover:text-primary"
      >
        ← All repositories
      </a>

      @if (detail.loading()) {
        <h1 class="text-3xl font-bold tracking-tight">Repository</h1>
        <app-page-state kind="loading" />
      } @else if (detail.status() === 'error') {
        <h1 class="text-3xl font-bold tracking-tight">Repository</h1>
        <app-page-state
          kind="error"
          [message]="detail.error() ?? ''"
          (retry)="detail.load()"
        />
      } @else if (detail.data(); as data) {
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0 space-y-1">
            <h1 class="truncate text-3xl font-bold tracking-tight">
              {{ data.repository.fullName }}
            </h1>
            @if (data.repository.description) {
              <p class="text-muted-foreground">
                {{ data.repository.description }}
              </p>
            }
            <p class="text-sm text-muted-foreground">
              {{ data.repository.private ? 'Private' : 'Public' }} · default
              branch <code>{{ data.repository.defaultBranch }}</code> · synced
              {{ ago(data.repository.lastSyncedAt) }}
            </p>
          </div>
          <div class="flex flex-col items-end gap-2">
            <app-ci-badge [state]="data.repository.ci.state" />
            @if (data.repository.ciStale) {
              <span class="text-xs text-muted-foreground">
                for {{ sha(data.repository.ci.sha) }}, not the latest commit
              </span>
            }
            <a
              [href]="data.repository.htmlUrl"
              target="_blank"
              rel="noreferrer"
              class="inline-flex items-center gap-1 text-sm font-medium text-primary"
            >
              Open on GitHub
              <lucide-icon name="external-link" class="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        <div class="grid gap-6 lg:grid-cols-2">
          <volt-card>
            <volt-card-header>
              <volt-card-title
                >Open pull requests ({{
                  data.pullRequests.length
                }})</volt-card-title
              >
            </volt-card-header>
            <volt-card-content>
              @if (data.pullRequests.length === 0) {
                <p class="text-sm text-muted-foreground">
                  No open pull requests.
                </p>
              } @else {
                <ul class="divide-y divide-border" data-testid="detail-prs">
                  @for (pr of data.pullRequests; track pr.id) {
                    <li
                      class="flex items-center justify-between gap-3 py-2 text-sm"
                    >
                      <span class="min-w-0 truncate">
                        <a
                          [href]="pr.htmlUrl"
                          target="_blank"
                          rel="noreferrer"
                          class="font-medium hover:text-primary"
                        >
                          #{{ pr.number }} {{ pr.title }}
                        </a>
                        @if (pr.draft) {
                          <span class="text-muted-foreground"> · draft</span>
                        }
                      </span>
                      <app-ci-badge [state]="pr.ci" />
                    </li>
                  }
                </ul>
              }
            </volt-card-content>
          </volt-card>

          <volt-card>
            <volt-card-header>
              <volt-card-title>Recent workflow runs</volt-card-title>
            </volt-card-header>
            <volt-card-content>
              @if (data.workflowRuns.length === 0) {
                <p class="text-sm text-muted-foreground">
                  No workflow runs recorded. This repository either has no
                  GitHub Actions workflows or none has run yet — it is not
                  counted as passing.
                </p>
              } @else {
                <ul class="divide-y divide-border" data-testid="detail-runs">
                  @for (run of data.workflowRuns; track run.id) {
                    <li
                      class="flex items-center justify-between gap-3 py-2 text-sm"
                    >
                      <span class="min-w-0 truncate">
                        <a
                          [href]="run.htmlUrl"
                          target="_blank"
                          rel="noreferrer"
                          class="font-medium hover:text-primary"
                        >
                          {{ run.name }} #{{ run.runNumber }}
                        </a>
                        <span class="text-muted-foreground">
                          · {{ run.branch ?? 'unknown branch' }} ·
                          {{ sha(run.headSha) }} · {{ ago(run.createdAt) }}
                        </span>
                      </span>
                      <span class="shrink-0 text-xs font-medium">{{
                        runLabel(run.status, run.conclusion)
                      }}</span>
                    </li>
                  }
                </ul>
              }
            </volt-card-content>
          </volt-card>

          <volt-card>
            <volt-card-header>
              <volt-card-title>Releases</volt-card-title>
            </volt-card-header>
            <volt-card-content>
              @if (data.releases.length === 0) {
                <p class="text-sm text-muted-foreground">
                  No releases.
                  @if (data.repository.version) {
                    Latest tag: {{ data.repository.version.value }}.
                  }
                </p>
              } @else {
                <ul class="divide-y divide-border">
                  @for (release of data.releases; track release.id) {
                    <li
                      class="flex items-center justify-between gap-3 py-2 text-sm"
                    >
                      <a
                        [href]="release.htmlUrl"
                        target="_blank"
                        rel="noreferrer"
                        class="font-medium hover:text-primary"
                      >
                        {{ release.name || release.tag }}
                        @if (release.prerelease) {
                          <span class="text-muted-foreground">
                            (pre-release)</span
                          >
                        }
                      </a>
                      <span class="text-xs text-muted-foreground">{{
                        ago(release.publishedAt)
                      }}</span>
                    </li>
                  }
                </ul>
              }
            </volt-card-content>
          </volt-card>

          <volt-card>
            <volt-card-header>
              <volt-card-title>Recent activity</volt-card-title>
            </volt-card-header>
            <volt-card-content>
              @if (data.activity.length === 0) {
                <p class="text-sm text-muted-foreground">
                  No events recorded for this repository yet.
                </p>
              } @else {
                <ul class="divide-y divide-border">
                  @for (item of data.activity; track item.id) {
                    <li
                      class="flex flex-wrap items-baseline justify-between gap-x-3 py-2 text-sm"
                    >
                      <span class="min-w-0">
                        <span class="font-medium">{{ label(item.type) }}</span>
                        <span class="text-muted-foreground">
                          — {{ item.summary }}</span
                        >
                      </span>
                      <span class="shrink-0 text-xs text-muted-foreground">{{
                        ago(item.occurredAt)
                      }}</span>
                    </li>
                  }
                </ul>
              }
            </volt-card-content>
          </volt-card>
        </div>
      }
    </div>
  `,
})
export default class RepositoryDetailPage {
  readonly #api = inject(RadarApi);

  /** Route param `[id]`, bound by withComponentInputBinding(). */
  readonly id = input.required<string>();

  protected readonly detail = new Remote<RepositoryDetailDto>(() =>
    this.#api.repository(Number(this.id())),
  );

  protected readonly sha = shortSha;
  protected readonly ago = (iso: string | null) => timeAgo(iso);
  protected readonly label = (type: keyof typeof DOMAIN_EVENT_LABEL) =>
    DOMAIN_EVENT_LABEL[type];
  protected readonly valid = computed(() => /^\d+$/.test(this.id()));

  constructor() {
    effect(() => {
      if (this.valid()) void this.detail.load();
    });
  }

  protected runLabel(status: string, conclusion: string | null): string {
    if (status !== 'completed') return status.replace(/_/g, ' ');
    return conclusion ? conclusion.replace(/_/g, ' ') : 'completed';
  }
}
