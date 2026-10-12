import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  DOMAIN_EVENT_LABEL,
  type DomainEventType,
} from '../../shared/domain-events';
import type { ActivityDto } from '../../shared/dto';
import { PageStateComponent } from '../components/page-state.component';
import { timeAgo } from '../radar/format';
import { RadarApi } from '../radar/radar-api.service';
import { Remote } from '../radar/remote';

@Component({
  selector: 'app-activity-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PageStateComponent],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">Activity</h1>
        <p class="mt-1 text-muted-foreground">
          Normalized events from GitHub webhooks, newest first. History is kept
          for 30 days.
        </p>
      </div>

      @if (activity.loading()) {
        <app-page-state kind="loading" />
      } @else if (activity.status() === 'error') {
        <app-page-state
          kind="error"
          [message]="activity.error() ?? ''"
          (retry)="activity.load()"
        />
      } @else if (activity.data(); as data) {
        @if (data.events.length === 0) {
          <app-page-state kind="empty" icon="activity" title="No activity yet">
            Events appear here when GitHub delivers webhooks for pushes, pull
            requests, workflow runs and releases. Webhook setup is described in
            Settings.
          </app-page-state>
        } @else {
          <ol
            class="divide-y divide-border rounded-lg border border-border bg-card"
            data-testid="activity-list"
          >
            @for (item of data.events; track item.id) {
              <li
                class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-4"
                [attr.data-event]="item.type"
              >
                <div class="min-w-0 space-y-0.5">
                  <p class="text-sm font-medium">{{ label(item.type) }}</p>
                  <p class="text-sm text-muted-foreground">
                    @if (item.repositoryId !== null) {
                      <a
                        [routerLink]="['/repositories', item.repositoryId]"
                        class="font-medium hover:text-primary"
                        >{{ item.repositoryFullName }}</a
                      >
                      —
                    }
                    @if (item.url) {
                      <a
                        [href]="item.url"
                        target="_blank"
                        rel="noreferrer"
                        class="hover:text-primary"
                        >{{ item.summary }}</a
                      >
                    } @else {
                      {{ item.summary }}
                    }
                    @if (item.actor) {
                      · {{ item.actor }}
                    }
                  </p>
                </div>
                <time
                  class="shrink-0 text-xs text-muted-foreground"
                  [attr.datetime]="item.occurredAt"
                  >{{ ago(item.occurredAt) }}</time
                >
              </li>
            }
          </ol>
        }
      }
    </div>
  `,
})
export default class ActivityPage {
  readonly #api = inject(RadarApi);
  protected readonly activity = new Remote<{ events: ActivityDto[] }>(() =>
    this.#api.activity(),
  );

  protected readonly ago = (iso: string | null) => timeAgo(iso);
  protected readonly label = (type: DomainEventType) =>
    DOMAIN_EVENT_LABEL[type] ?? type;

  constructor() {
    void this.activity.load();
  }
}
