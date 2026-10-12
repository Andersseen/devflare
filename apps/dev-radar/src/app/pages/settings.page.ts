import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import {
  VoltButton,
  VoltCard,
  VoltCardContent,
  VoltCardHeader,
  VoltCardTitle,
} from '@voltui/components';
import type { SettingsDto, SyncResultDto } from '../../shared/dto';
import { PageStateComponent } from '../components/page-state.component';
import { ApiError } from '../radar/api';
import { timeAgo } from '../radar/format';
import { RadarAccess } from '../radar/radar-access.service';
import { RadarApi } from '../radar/radar-api.service';
import { Remote } from '../radar/remote';

@Component({
  selector: 'app-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LucideAngularModule,
    VoltButton,
    VoltCard,
    VoltCardContent,
    VoltCardHeader,
    VoltCardTitle,
    PageStateComponent,
  ],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">Settings</h1>
        <p class="mt-1 text-muted-foreground">
          GitHub integration status and setup.
        </p>
      </div>

      @if (settings.loading()) {
        <app-page-state kind="loading" />
      } @else if (settings.status() === 'error') {
        <app-page-state
          kind="error"
          [message]="settings.error() ?? ''"
          (retry)="settings.load()"
        />
      } @else if (settings.data(); as data) {
        <volt-card>
          <volt-card-header>
            <volt-card-title>GitHub integration</volt-card-title>
          </volt-card-header>
          <volt-card-content class="space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div
                class="flex items-center gap-2"
                data-testid="connection-status"
              >
                @if (data.connection.configured) {
                  <lucide-icon
                    name="circle-check"
                    class="h-5 w-5 text-emerald-600"
                  />
                  <span class="font-medium">GitHub App configured</span>
                } @else {
                  <lucide-icon name="circle-x" class="h-5 w-5 text-red-600" />
                  <span class="font-medium"
                    >Disconnected — GitHub App not configured</span
                  >
                }
              </div>
              <volt-button
                variant="outline"
                [disabled]="!data.connection.configured || syncing()"
                (click)="sync()"
                data-testid="sync-button"
              >
                <lucide-icon
                  name="refresh-cw"
                  class="mr-2 h-4 w-4"
                  [class.animate-spin]="syncing()"
                />
                {{ syncing() ? 'Syncing…' : 'Sync now' }}
              </volt-button>
            </div>

            @if (data.connection.missing.length > 0) {
              <p class="text-sm text-muted-foreground">
                Missing settings:
                @for (name of data.connection.missing; track name) {
                  <code class="mx-0.5 rounded bg-muted px-1 py-0.5 text-xs">{{
                    name
                  }}</code>
                }
              </p>
            }
            @if (!data.connection.webhookConfigured) {
              <p class="text-sm text-muted-foreground">
                Webhooks are off until
                <code class="rounded bg-muted px-1 py-0.5 text-xs"
                  >GITHUB_WEBHOOK_SECRET</code
                >
                is set; state then only updates on manual or scheduled syncs.
              </p>
            }

            @if (syncResult(); as result) {
              <div
                class="rounded-md border border-border bg-muted/30 p-3 text-sm"
                role="status"
                data-testid="sync-result"
              >
                Synced {{ result.repositoriesSynced }} repositories across
                {{ result.installations }} installation(s).
                @if (result.repositoriesRemaining > 0) {
                  {{ result.repositoriesRemaining }} more will sync on the next
                  run (per-run request budget) — press Sync now again to
                  continue.
                }
                @for (error of result.errors; track error) {
                  <p class="mt-1 text-red-700 dark:text-red-300">{{ error }}</p>
                }
              </div>
            }
            @if (syncError(); as message) {
              <p class="text-sm text-red-700 dark:text-red-300" role="alert">
                {{ message }}
              </p>
            }

            <dl class="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt class="text-xs text-muted-foreground">Installations</dt>
                <dd class="text-lg font-semibold">
                  {{ data.installations.length }}
                </dd>
              </div>
              <div>
                <dt class="text-xs text-muted-foreground">
                  Connected repositories
                </dt>
                <dd class="text-lg font-semibold">{{ data.repositories }}</dd>
              </div>
              <div>
                <dt class="text-xs text-muted-foreground">
                  Last synchronization
                </dt>
                <dd class="text-lg font-semibold">
                  {{ ago(data.lastSyncedAt) }}
                </dd>
              </div>
            </dl>
          </volt-card-content>
        </volt-card>

        <volt-card>
          <volt-card-header>
            <volt-card-title>Installations</volt-card-title>
          </volt-card-header>
          <volt-card-content>
            @if (data.installations.length === 0) {
              <p class="text-sm text-muted-foreground">
                No installations yet.
                @if (data.connection.installUrl) {
                  <a
                    [href]="data.connection.installUrl"
                    target="_blank"
                    rel="noreferrer"
                    class="font-medium text-primary underline"
                  >
                    Install the GitHub App
                  </a>
                  on your account or organization, then press Sync now.
                } @else {
                  Set
                  <code class="rounded bg-muted px-1 py-0.5 text-xs"
                    >GITHUB_APP_SLUG</code
                  >
                  to get an install link.
                }
              </p>
            } @else {
              <ul class="divide-y divide-border" data-testid="installations">
                @for (item of data.installations; track item.id) {
                  <li
                    class="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                  >
                    <div>
                      <p class="font-medium">
                        {{ item.account }}
                        <span class="text-muted-foreground"
                          >· {{ item.accountType }}</span
                        >
                        @if (item.suspended) {
                          <span class="text-amber-700 dark:text-amber-300">
                            · suspended</span
                          >
                        }
                      </p>
                      <p class="text-muted-foreground">
                        {{ item.repositories }} repositories ({{
                          item.repositorySelection === 'all'
                            ? 'all repositories'
                            : 'selected repositories'
                        }}) · synced {{ ago(item.lastSyncedAt) }}
                      </p>
                      @if (item.syncError) {
                        <p class="text-red-700 dark:text-red-300">
                          Last sync: {{ item.syncError }}
                        </p>
                      }
                    </div>
                  </li>
                }
              </ul>
              @if (data.connection.installUrl) {
                <a
                  [href]="data.connection.installUrl"
                  target="_blank"
                  rel="noreferrer"
                  class="mt-3 inline-block text-sm font-medium text-primary underline"
                >
                  Install on another account
                </a>
              }
            }
          </volt-card-content>
        </volt-card>

        <volt-card>
          <volt-card-header>
            <volt-card-title>Setup</volt-card-title>
          </volt-card-header>
          <volt-card-content class="space-y-4 text-sm">
            <p class="text-muted-foreground">
              DevRadar reads GitHub as a GitHub App installation, read-only.
              Full steps are in the DevRadar README.
            </p>
            <div>
              <p class="font-medium">Webhook URL</p>
              <code
                class="mt-1 block break-all rounded bg-muted px-2 py-1"
                data-testid="webhook-url"
                >{{ data.setup.webhookUrl }}</code
              >
              <p class="mt-1 text-muted-foreground">
                Content type <code>application/json</code>, with a secret that
                matches <code>GITHUB_WEBHOOK_SECRET</code>.
              </p>
            </div>
            <div>
              <p class="font-medium">Repository permissions (read-only)</p>
              <p class="text-muted-foreground">
                Metadata, Contents, Pull requests, Actions.
              </p>
            </div>
            <div>
              <p class="font-medium">Subscribe to events</p>
              <p class="text-muted-foreground">
                Installation and installation repositories are delivered
                automatically; also select Push, Pull request, Workflow run and
                Release.
              </p>
            </div>
            <p class="text-muted-foreground">{{ data.setup.callbackNote }}</p>
          </volt-card-content>
        </volt-card>
      }
    </div>
  `,
})
export default class SettingsPage {
  readonly #api = inject(RadarApi);
  readonly #access = inject(RadarAccess);

  protected readonly settings = new Remote<SettingsDto>(() =>
    this.#api.settings(),
  );
  protected readonly syncing = signal(false);
  protected readonly syncResult = signal<SyncResultDto | null>(null);
  protected readonly syncError = signal<string | null>(null);
  protected readonly ago = (iso: string | null) => timeAgo(iso);

  constructor() {
    void this.settings.load();
  }

  protected async sync(): Promise<void> {
    if (this.syncing() || !this.settings.data()?.connection.configured) return;
    this.syncing.set(true);
    this.syncError.set(null);
    this.syncResult.set(null);
    try {
      this.syncResult.set(await this.#api.sync());
      await this.settings.load();
    } catch (error) {
      if (this.#access.handleAccessError(error)) return;
      this.syncError.set(
        error instanceof ApiError ? error.message : 'Sync failed.',
      );
    } finally {
      this.syncing.set(false);
    }
  }
}
