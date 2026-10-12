import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import {
  VoltCard,
  VoltCardContent,
  VoltCardHeader,
  VoltCardTitle,
} from '@voltui/components';
import { DOMAIN_EVENT_LABEL } from '../../shared/domain-events';
import type { OverviewDto } from '../../shared/dto';
import { CiBadgeComponent } from '../components/ci-badge.component';
import { DisconnectedNoticeComponent } from '../components/disconnected-notice.component';
import { PageStateComponent } from '../components/page-state.component';
import { timeAgo } from '../radar/format';
import { RadarApi } from '../radar/radar-api.service';
import { Remote } from '../radar/remote';

@Component({
  selector: 'app-overview-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    LucideAngularModule,
    VoltCard,
    VoltCardContent,
    VoltCardHeader,
    VoltCardTitle,
    CiBadgeComponent,
    DisconnectedNoticeComponent,
    PageStateComponent,
  ],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">Overview</h1>
        <p class="mt-1 text-muted-foreground">
          What needs attention across your GitHub repositories.
        </p>
      </div>

      @if (overview.loading()) {
        <app-page-state kind="loading" />
      } @else if (overview.status() === 'error') {
        <app-page-state
          kind="error"
          [message]="overview.error() ?? ''"
          (retry)="overview.load()"
        />
      } @else if (overview.data(); as data) {
        <app-disconnected-notice
          [connection]="data.connection"
          [empty]="data.totals.repositories === 0"
        />

        <section
          class="grid grid-cols-2 gap-3 lg:grid-cols-5"
          aria-label="Totals"
          data-testid="totals"
        >
          @for (stat of stats(data); track stat.label) {
            <a
              [routerLink]="stat.link"
              [queryParams]="stat.query"
              class="rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <p
                class="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                {{ stat.label }}
              </p>
              <p
                class="mt-1 text-3xl font-bold tabular-nums"
                [attr.data-stat]="stat.key"
              >
                {{ stat.value }}
              </p>
            </a>
          }
        </section>

        <div class="grid gap-6 lg:grid-cols-2">
          <volt-card>
            <volt-card-header>
              <volt-card-title>Needs attention</volt-card-title>
            </volt-card-header>
            <volt-card-content>
              @if (data.attention.length === 0) {
                <p class="text-sm text-muted-foreground">
                  @if (data.totals.repositories === 0) {
                    No repositories yet.
                  } @else {
                    No repository has failing or running CI.
                  }
                </p>
              } @else {
                <ul class="divide-y divide-border" data-testid="attention">
                  @for (repo of data.attention; track repo.id) {
                    <li class="flex items-center justify-between gap-3 py-2">
                      <a
                        [routerLink]="['/repositories', repo.id]"
                        class="min-w-0 truncate font-medium hover:text-primary"
                      >
                        {{ repo.fullName }}
                      </a>
                      <app-ci-badge [state]="repo.ci.state" />
                    </li>
                  }
                </ul>
              }
            </volt-card-content>
          </volt-card>

          <volt-card>
            <volt-card-header>
              <volt-card-title>Recent releases</volt-card-title>
            </volt-card-header>
            <volt-card-content>
              @if (data.recentReleases.length === 0) {
                <p class="text-sm text-muted-foreground">
                  No releases synced yet.
                </p>
              } @else {
                <ul class="divide-y divide-border">
                  @for (release of data.recentReleases; track release.id) {
                    <li
                      class="flex items-center justify-between gap-3 py-2 text-sm"
                    >
                      <span class="min-w-0 truncate">
                        <a
                          [href]="release.htmlUrl"
                          target="_blank"
                          rel="noreferrer"
                          class="font-medium hover:text-primary"
                          >{{ release.tag }}</a
                        >
                        <span class="text-muted-foreground">
                          · {{ release.repositoryFullName }}</span
                        >
                      </span>
                      <span class="shrink-0 text-xs text-muted-foreground">{{
                        ago(release.publishedAt)
                      }}</span>
                    </li>
                  }
                </ul>
              }
            </volt-card-content>
          </volt-card>
        </div>

        <volt-card>
          <volt-card-header>
            <volt-card-title>Recent activity</volt-card-title>
          </volt-card-header>
          <volt-card-content>
            @if (data.recentActivity.length === 0) {
              <p class="text-sm text-muted-foreground">
                Events appear here as GitHub delivers webhooks.
              </p>
            } @else {
              <ul class="divide-y divide-border">
                @for (item of data.recentActivity; track item.id) {
                  <li
                    class="flex flex-wrap items-baseline justify-between gap-x-3 py-2 text-sm"
                  >
                    <span class="min-w-0">
                      <span class="font-medium">{{ label(item.type) }}</span>
                      <span class="text-muted-foreground">
                        · {{ item.repositoryFullName ?? 'GitHub App' }} —
                        {{ item.summary }}
                      </span>
                    </span>
                    <span class="shrink-0 text-xs text-muted-foreground">{{
                      ago(item.occurredAt)
                    }}</span>
                  </li>
                }
              </ul>
              <a
                routerLink="/activity"
                class="mt-3 inline-block text-sm font-medium text-primary"
              >
                All activity
              </a>
            }
          </volt-card-content>
        </volt-card>

        <p class="text-xs text-muted-foreground">
          Last synchronized {{ ago(data.lastSyncedAt) }}. Dashboards read stored
          state; webhooks and scheduled syncs keep it current.
        </p>
      }
    </div>
  `,
})
export default class OverviewPage {
  readonly #api = inject(RadarApi);
  protected readonly overview = new Remote<OverviewDto>(() =>
    this.#api.overview(),
  );

  protected readonly ago = (iso: string | null) => timeAgo(iso);
  protected readonly label = (type: keyof typeof DOMAIN_EVENT_LABEL) =>
    DOMAIN_EVENT_LABEL[type];

  constructor() {
    void this.overview.load();
  }

  protected stats(data: OverviewDto) {
    const t = data.totals;
    return [
      {
        key: 'repositories',
        label: 'Repositories',
        value: t.repositories,
        link: '/repositories',
        query: {},
      },
      {
        key: 'pull-requests',
        label: 'Open PRs',
        value: t.openPullRequests,
        link: '/pull-requests',
        query: {},
      },
      {
        key: 'failing',
        label: 'Failing CI',
        value: t.failing,
        link: '/repositories',
        query: { ci: 'failure' },
      },
      {
        key: 'pending',
        label: 'Running CI',
        value: t.pending,
        link: '/repositories',
        query: { ci: 'pending' },
      },
      {
        key: 'no-ci',
        label: 'No CI',
        value: t.noCi,
        link: '/repositories',
        query: { ci: 'none' },
      },
    ];
  }
}
