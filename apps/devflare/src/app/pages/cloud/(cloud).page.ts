import {
  Component,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import {
  VoltCard,
  VoltCardHeader,
  VoltCardTitle,
  VoltCardContent,
  VoltButton,
  VoltError,
} from '@voltui/components';
import { CloudflareAccount, formatRelative } from '@org/core';
import { CloudGate } from './cloud-gate';
import { DeploymentStatus } from './deployment-status';

/**
 * What is actually running on the account: every Worker and every Pages
 * project, newest activity first.
 *
 * Read-only, and deliberately not a mirror — the server holds a 60s memo and
 * Cloudflare stays the source of truth, so Reload means reload.
 */
@Component({
  selector: 'app-cloud-page',
  imports: [
    RouterLink,
    LucideAngularModule,
    VoltCard,
    VoltCardHeader,
    VoltCardTitle,
    VoltCardContent,
    VoltButton,
    VoltError,
    CloudGate,
    DeploymentStatus,
  ],
  template: `
    <div class="space-y-6">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h1 class="text-3xl font-bold tracking-tight">Cloud</h1>
          <p class="text-muted-foreground mt-1">
            @if (connectedAccount(); as account) {
              Everything you have deployed on {{ account }}
            } @else {
              Everything you have deployed on Cloudflare
            }
          </p>
        </div>
        <div class="flex items-center gap-2">
          @if (canDisconnect()) {
            <volt-button
              variant="ghost"
              size="sm"
              [disabled]="disconnecting()"
              (click)="disconnect()"
            >
              Disconnect
            </volt-button>
          }
          @if (status()?.configured) {
            <volt-button variant="outline" size="sm" (click)="reload()">
              <lucide-icon
                name="refresh-cw"
                class="w-4 h-4 mr-1"
                [class.animate-spin]="loading()"
              />
              Reload
            </volt-button>
          }
        </div>
      </div>

      @if (statusError()) {
        <volt-error>{{ statusError() }}</volt-error>
      }

      <!-- The connect flow comes back as a top-level navigation, so its outcome
           arrives in the URL rather than in a response this page can read. -->
      @if (connectOutcome(); as outcome) {
        @if (outcome === 'ok') {
          <div
            class="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm"
          >
            <lucide-icon name="check" class="w-4 h-4 text-emerald-600" />
            Cloudflare account connected.
          </div>
        } @else {
          <volt-error>{{ connectError(outcome) }}</volt-error>
        }
      }

      <app-cloud-gate [status]="status()">
        @if (error()) {
          <volt-error class="mb-4">{{ error() }}</volt-error>
        }

        @if (loading() && !workers().length && !projects().length) {
          <div class="flex items-center justify-center py-12">
            <lucide-icon
              name="loader"
              class="animate-spin w-8 h-8 text-muted-foreground"
            />
          </div>
        } @else {
          <div class="space-y-6">
            <!-- Workers -->
            <volt-card>
              <volt-card-header
                class="flex flex-row items-center justify-between"
              >
                <volt-card-title class="flex items-center gap-2">
                  <lucide-icon name="zap" class="w-5 h-5 text-amber-500" />
                  Workers
                </volt-card-title>
                <span class="text-sm text-muted-foreground"
                  >{{ workers().length }} total</span
                >
              </volt-card-header>
              <volt-card-content>
                @if (workers().length === 0) {
                  <p class="text-muted-foreground py-6 text-center">
                    No Workers on this account yet.
                  </p>
                } @else {
                  <ul class="divide-y divide-border">
                    @for (worker of workers(); track worker.name) {
                      <li
                        class="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div class="min-w-0">
                          <a
                            [routerLink]="['/cloud/workers', worker.name]"
                            class="font-medium truncate hover:text-primary hover:underline"
                            >{{ worker.name }}</a
                          >
                          @if (worker.domains.length) {
                            <div class="flex flex-wrap gap-x-3 mt-0.5">
                              @for (domain of worker.domains; track domain) {
                                <a
                                  [href]="'https://' + domain"
                                  target="_blank"
                                  rel="noreferrer"
                                  class="text-sm text-muted-foreground hover:text-primary hover:underline"
                                  >{{ domain }}</a
                                >
                              }
                            </div>
                          }
                        </div>
                        <span
                          class="text-sm text-muted-foreground whitespace-nowrap"
                        >
                          updated {{ relative(worker.modifiedOn) }}
                        </span>
                      </li>
                    }
                  </ul>
                }
              </volt-card-content>
            </volt-card>

            <!-- Pages -->
            <volt-card>
              <volt-card-header
                class="flex flex-row items-center justify-between"
              >
                <volt-card-title class="flex items-center gap-2">
                  <lucide-icon name="globe" class="w-5 h-5 text-sky-500" />
                  Pages
                </volt-card-title>
                <span class="text-sm text-muted-foreground"
                  >{{ projects().length }} total</span
                >
              </volt-card-header>
              <volt-card-content>
                @if (projects().length === 0) {
                  <p class="text-muted-foreground py-6 text-center">
                    No Pages projects on this account yet.
                  </p>
                } @else {
                  <ul class="divide-y divide-border">
                    @for (project of projects(); track project.name) {
                      <li
                        class="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div class="min-w-0">
                          <div class="flex items-center gap-2">
                            <a
                              [routerLink]="['/cloud/pages', project.name]"
                              class="font-medium truncate hover:text-primary hover:underline"
                              >{{ project.name }}</a
                            >
                            @if (project.latestDeployment; as deployment) {
                              <app-deployment-status
                                [status]="deployment.status"
                                [stage]="deployment.stage"
                              />
                            }
                          </div>
                          <div
                            class="flex flex-wrap items-center gap-x-3 mt-0.5 text-sm text-muted-foreground"
                          >
                            @for (domain of project.domains; track domain) {
                              <a
                                [href]="'https://' + domain"
                                target="_blank"
                                rel="noreferrer"
                                class="hover:text-primary hover:underline"
                                >{{ domain }}</a
                              >
                            }
                            @if (project.repo) {
                              <span class="flex items-center gap-1">
                                <lucide-icon
                                  name="github"
                                  class="w-3.5 h-3.5"
                                />
                                {{ project.repo }}
                              </span>
                            }
                          </div>
                        </div>
                        <span
                          class="text-sm text-muted-foreground whitespace-nowrap"
                        >
                          @if (project.latestDeployment; as deployment) {
                            deployed {{ relative(deployment.createdOn) }}
                          } @else {
                            never deployed
                          }
                        </span>
                      </li>
                    }
                  </ul>
                }
              </volt-card-content>
            </volt-card>
          </div>
        }
      </app-cloud-gate>
    </div>
  `,
})
export default class CloudPage {
  #cloud = inject(CloudflareAccount);
  #route = inject(ActivatedRoute);

  status = this.#cloud.status;
  workers = this.#cloud.workers;
  projects = this.#cloud.projects;
  loading = this.#cloud.loading;
  error = this.#cloud.error;

  protected readonly relative = formatRelative;

  /** Only for a failure to even ask — the service owns per-resource errors. */
  statusError = signal('');

  /**
   * Read once from the URL the connect callback redirected to. A snapshot
   * rather than a subscription: this page is only ever landed on, never
   * navigated within.
   */
  readonly connectOutcome = signal(
    this.#route.snapshot.queryParamMap.get('connect'),
  );

  /** Named after the account rather than "Cloudflare" once one is connected. */
  readonly connectedAccount = computed(
    () => this.status()?.connection.accountName ?? null,
  );

  /**
   * Only an OAuth grant can be handed back. A `CLOUDFLARE_API_TOKEN` is
   * configuration, and this page must not pretend it can remove it.
   */
  readonly canDisconnect = computed(
    () => this.status()?.connection.kind === 'oauth',
  );

  readonly disconnecting = signal(false);

  constructor() {
    // Browser-only: the service fetches a relative URL, which throws
    // `ERR_INVALID_URL` under SSR.
    afterNextRender(() => this.load());
  }

  async reload() {
    await this.load(true);
  }

  /** Cloudflare's own wording for the refusal is not shown — it names the client. */
  connectError(outcome: string): string {
    switch (outcome) {
      case 'invalid_state':
        return 'That connection attempt expired. Try again.';
      case 'not_configured':
        return 'This server has no Cloudflare OAuth client configured.';
      case 'access_denied':
        return 'The request was declined on Cloudflare.';
      default:
        return 'Could not complete the connection with Cloudflare.';
    }
  }

  async disconnect() {
    this.disconnecting.set(true);
    try {
      const status = await this.#cloud.disconnect();
      this.connectOutcome.set(null);
      // The listings on screen were fetched with the credential just handed
      // back. Reload them if anything is still authorised to read them.
      if (status.configured) await this.#cloud.loadOverview(true);
    } catch (error: unknown) {
      this.statusError.set(
        error instanceof Error ? error.message : 'Could not disconnect',
      );
    } finally {
      this.disconnecting.set(false);
    }
  }

  private async load(refresh = false) {
    try {
      const status = await this.#cloud.loadStatus();
      if (status.admin && status.configured) {
        await this.#cloud.loadOverview(refresh);
      }
    } catch (error: unknown) {
      this.statusError.set(
        error instanceof Error ? error.message : 'Could not reach the server',
      );
      console.error('Failed to load the Cloud section', error);
    }
  }
}
