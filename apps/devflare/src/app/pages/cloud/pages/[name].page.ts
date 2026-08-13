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
  type CloudPagesDetail,
} from '@org/core';
import { DeploymentStatus } from '../deployment-status';

/**
 * One Pages project: where it lives, and what has been deployed to it.
 *
 * The history is the point — it is the thing the dashboard is otherwise needed
 * for, and the only place a failed build is visible.
 */
@Component({
  selector: 'app-cloud-pages-detail-page',
  imports: [
    RouterLink,
    LucideAngularModule,
    VoltCard,
    VoltCardHeader,
    VoltCardTitle,
    VoltCardContent,
    VoltButton,
    VoltError,
    DeploymentStatus,
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
              @for (domain of loaded.project.domains; track domain) {
                <a
                  [href]="'https://' + domain"
                  target="_blank"
                  rel="noreferrer"
                  class="hover:text-primary hover:underline"
                  >{{ domain }}</a
                >
              }
              <span class="flex items-center gap-1">
                <lucide-icon name="git-branch" class="w-3.5 h-3.5" />
                {{ loaded.project.productionBranch }}
              </span>
              @if (loaded.project.repo) {
                <span class="flex items-center gap-1">
                  <lucide-icon name="github" class="w-3.5 h-3.5" />
                  {{ loaded.project.repo }}
                </span>
              }
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
            <volt-card-title>Deployments</volt-card-title>
          </volt-card-header>
          <volt-card-content>
            @if (loaded.deployments.length === 0) {
              <p class="text-muted-foreground py-6 text-center">
                Nothing has been deployed to this project yet.
              </p>
            } @else {
              <ul class="divide-y divide-border">
                @for (deployment of loaded.deployments; track deployment.id) {
                  <li class="py-3 space-y-1">
                    <div class="flex items-center justify-between gap-3">
                      <div class="flex items-center gap-2 min-w-0">
                        <app-deployment-status
                          [status]="deployment.status"
                          [stage]="deployment.stage"
                        />
                        <span class="text-sm font-medium truncate">
                          {{ deployment.commitMessage ?? deployment.shortId }}
                        </span>
                      </div>
                      <span
                        class="text-sm text-muted-foreground whitespace-nowrap"
                      >
                        {{ relative(deployment.createdOn) }}
                      </span>
                    </div>
                    <div
                      class="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground"
                    >
                      <span>{{ deployment.environment }}</span>
                      @if (deployment.branch) {
                        <span class="flex items-center gap-1">
                          <lucide-icon name="git-branch" class="w-3 h-3" />
                          {{ deployment.branch }}
                        </span>
                      }
                      @if (deployment.commit) {
                        <span class="font-mono">{{
                          deployment.commit.slice(0, 7)
                        }}</span>
                      }
                      <a
                        [href]="deployment.url"
                        target="_blank"
                        rel="noreferrer"
                        class="flex items-center gap-1 hover:text-primary"
                      >
                        <lucide-icon name="external-link" class="w-3 h-3" />
                        preview
                      </a>
                    </div>
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
export default class CloudPagesDetailPage {
  #cloud = inject(CloudflareAccount);

  /** Bound from the route by `withComponentInputBinding()`. */
  readonly name = input.required<string>();

  detail = signal<CloudPagesDetail | null>(null);
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
      this.detail.set(await this.#cloud.loadPagesProject(this.name(), refresh));
    } catch (error: unknown) {
      this.error.set(
        error instanceof Error ? error.message : 'Failed to load the project',
      );
    } finally {
      this.loading.set(false);
    }
  }
}
