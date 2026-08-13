import { Component, afterNextRender, inject, signal } from '@angular/core';
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
            Everything you have deployed on Cloudflare
          </p>
        </div>
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

      @if (statusError()) {
        <volt-error>{{ statusError() }}</volt-error>
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
                          <p class="font-medium truncate">{{ worker.name }}</p>
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
                            <p class="font-medium truncate">
                              {{ project.name }}
                            </p>
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

  status = this.#cloud.status;
  workers = this.#cloud.workers;
  projects = this.#cloud.projects;
  loading = this.#cloud.loading;
  error = this.#cloud.error;

  protected readonly relative = formatRelative;

  /** Only for a failure to even ask — the service owns per-resource errors. */
  statusError = signal('');

  constructor() {
    // Browser-only: the service fetches a relative URL, which throws
    // `ERR_INVALID_URL` under SSR.
    afterNextRender(() => this.load());
  }

  async reload() {
    await this.load(true);
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
