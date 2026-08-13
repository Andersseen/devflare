import {
  Component,
  afterNextRender,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import {
  VoltCard,
  VoltCardHeader,
  VoltCardTitle,
  VoltCardContent,
  VoltButton,
  VoltError,
} from '@voltui/components';
import {
  CloudflareAccount,
  formatRelative,
  type CloudWorkerDetail,
} from '@org/core';

/**
 * One Worker: its domains and the versions uploaded to it.
 *
 * Versions, not deployments — which version is live is a gradual-deployment
 * question this page deliberately does not answer, rather than guessing.
 */
@Component({
  selector: 'app-cloud-worker-detail-page',
  imports: [
    RouterLink,
    LucideAngularModule,
    VoltCard,
    VoltCardHeader,
    VoltCardTitle,
    VoltCardContent,
    VoltButton,
    VoltError,
  ],
  template: `
    <div class="space-y-6">
      <a
        routerLink="/cloud"
        class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
      >
        <lucide-icon name="arrow-left" class="w-4 h-4" />
        Back to Cloud
      </a>

      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <h1 class="text-3xl font-bold tracking-tight truncate">
            {{ name() }}
          </h1>
          @if (detail(); as loaded) {
            <div
              class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground"
            >
              @for (domain of loaded.worker.domains; track domain) {
                <a
                  [href]="'https://' + domain"
                  target="_blank"
                  rel="noreferrer"
                  class="hover:text-primary hover:underline"
                  >{{ domain }}</a
                >
              }
              <span>updated {{ relative(loaded.worker.modifiedOn) }}</span>
            </div>
          }
        </div>
        <volt-button variant="outline" size="sm" (click)="reload()">
          <lucide-icon
            name="refresh-cw"
            class="w-4 h-4 mr-1"
            [class.animate-spin]="loading()"
          />
          Reload
        </volt-button>
      </div>

      @if (error()) {
        <volt-error>{{ error() }}</volt-error>
      }

      @if (loading() && !detail()) {
        <div class="flex items-center justify-center py-12">
          <lucide-icon
            name="loader"
            class="animate-spin w-8 h-8 text-muted-foreground"
          />
        </div>
      } @else if (detail(); as loaded) {
        <volt-card>
          <volt-card-header>
            <volt-card-title>Versions</volt-card-title>
          </volt-card-header>
          <volt-card-content>
            @if (loaded.versions.length === 0) {
              <p class="text-muted-foreground py-6 text-center">
                No version history — this Worker predates versioning, or the
                token cannot read it.
              </p>
            } @else {
              <ul class="divide-y divide-border">
                @for (version of loaded.versions; track version.id) {
                  <li
                    class="py-3 flex items-start justify-between gap-3 text-sm"
                  >
                    <div class="min-w-0">
                      <p class="font-medium truncate">
                        {{ version.message ?? version.tag ?? version.id }}
                      </p>
                      <div
                        class="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground mt-0.5"
                      >
                        @if (version.number !== null) {
                          <span>v{{ version.number }}</span>
                        }
                        @if (version.source) {
                          <span>{{ version.source }}</span>
                        }
                        @if (version.author) {
                          <span>{{ version.author }}</span>
                        }
                      </div>
                    </div>
                    <span class="text-muted-foreground whitespace-nowrap">
                      {{ relative(version.createdOn) }}
                    </span>
                  </li>
                }
              </ul>
            }
          </volt-card-content>
        </volt-card>
      }
    </div>
  `,
})
export default class CloudWorkerDetailPage {
  #cloud = inject(CloudflareAccount);

  /** Bound from the route by `withComponentInputBinding()`. */
  readonly name = input.required<string>();

  detail = signal<CloudWorkerDetail | null>(null);
  loading = signal(true);
  error = signal('');

  protected readonly relative = formatRelative;

  constructor() {
    // Browser-only: the service fetches a relative URL, which throws
    // `ERR_INVALID_URL` under SSR.
    afterNextRender(() => this.load());
  }

  async reload() {
    await this.load(true);
  }

  private async load(refresh = false) {
    this.loading.set(true);
    this.error.set('');
    try {
      this.detail.set(await this.#cloud.loadWorker(this.name(), refresh));
    } catch (error: unknown) {
      this.error.set(
        error instanceof Error ? error.message : 'Failed to load the Worker',
      );
    } finally {
      this.loading.set(false);
    }
  }
}
