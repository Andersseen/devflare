import {
  Component,
  afterNextRender,
  computed,
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
 * One Pages project: where it lives, what has been deployed to it, and the two
 * things worth doing from here — deploy the production branch again, or put an
 * earlier deployment back.
 *
 * Both actions are additive on Cloudflare's side (a rollback creates a new
 * production deployment from an existing build), so neither can lose history.
 * Both still ask first: this is the one page in DevFlare that changes what the
 * public sees.
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

        <div class="flex items-center gap-2 shrink-0">
          @if (canDeploy()) {
            @if (pending()?.kind === 'deploy') {
              <span class="text-sm text-muted-foreground"
                >Deploy {{ productionBranch() }}?</span
              >
              <volt-button size="sm" [disabled]="acting()" (click)="deploy()">
                Confirm
              </volt-button>
              <volt-button
                size="sm"
                variant="outline"
                [disabled]="acting()"
                (click)="cancel()"
              >
                Cancel
              </volt-button>
            } @else {
              <volt-button
                size="sm"
                [disabled]="acting()"
                (click)="askDeploy()"
              >
                <lucide-icon name="rocket" class="w-4 h-4 mr-1" />
                Deploy
              </volt-button>
            }
          } @else if (detail()) {
            <!-- Saying nothing here reads as a missing feature. Cloudflare
                 genuinely cannot rebuild a direct-upload project: it holds no
                 source to build from, only the artefacts CI pushed. -->
            <span class="text-sm text-muted-foreground">
              Direct upload — deploys come from CI
            </span>
          }
          <volt-button
            variant="outline"
            size="sm"
            [disabled]="acting()"
            (click)="reload()"
          >
            <lucide-icon
              name="refresh-cw"
              class="w-4 h-4 mr-1"
              [class.animate-spin]="loading()"
            />
            Reload
          </volt-button>
        </div>
      </div>

      @if (error()) {
        <volt-error>{{ error() }}</volt-error>
      }
      @if (notice()) {
        <p
          class="text-sm rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-3 py-2"
        >
          {{ notice() }}
        </p>
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
                @for (
                  deployment of loaded.deployments;
                  track deployment.id;
                  let first = $first
                ) {
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
                        @if (first) {
                          <span class="text-xs text-muted-foreground"
                            >current</span
                          >
                        }
                      </div>
                      <div class="flex items-center gap-2 shrink-0">
                        @if (canRollbackTo(deployment, first)) {
                          @if (pending()?.id === deployment.id) {
                            <span class="text-sm text-muted-foreground"
                              >Roll back to this?</span
                            >
                            <volt-button
                              size="sm"
                              [disabled]="acting()"
                              (click)="rollback(deployment.id)"
                            >
                              Confirm
                            </volt-button>
                            <volt-button
                              size="sm"
                              variant="outline"
                              [disabled]="acting()"
                              (click)="cancel()"
                            >
                              Cancel
                            </volt-button>
                          } @else {
                            <volt-button
                              size="sm"
                              variant="outline"
                              [disabled]="acting()"
                              (click)="askRollback(deployment.id)"
                            >
                              <lucide-icon
                                name="rotate-ccw"
                                class="w-3.5 h-3.5 mr-1"
                              />
                              Rollback
                            </volt-button>
                          }
                        }
                        <span
                          class="text-sm text-muted-foreground whitespace-nowrap"
                        >
                          {{ relative(deployment.createdOn) }}
                        </span>
                      </div>
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
  notice = signal('');

  /** The action awaiting a second click, if any. */
  pending = signal<{ kind: 'deploy' | 'rollback'; id?: string } | null>(null);
  acting = signal(false);

  protected readonly relative = formatRelative;

  /** Only a git-connected project has a branch Cloudflare can build again. */
  protected readonly canDeploy = computed(
    () => !!this.detail()?.project.gitConnected && !this.loading(),
  );

  protected readonly productionBranch = computed(
    () => this.detail()?.project.productionBranch ?? 'production',
  );

  constructor() {
    // Browser-only: the service fetches a relative URL, which throws
    // `ERR_INVALID_URL` under SSR.
    afterNextRender(() => this.load());
  }

  /** Rolling back to the deployment already live, or to a failed build, is not
   * an action worth offering. */
  protected canRollbackTo(
    deployment: { status: string; environment: string },
    isCurrent: boolean,
  ): boolean {
    return (
      !isCurrent &&
      deployment.status === 'success' &&
      deployment.environment === 'production'
    );
  }

  askDeploy() {
    this.pending.set({ kind: 'deploy' });
  }

  askRollback(id: string) {
    this.pending.set({ kind: 'rollback', id });
  }

  cancel() {
    this.pending.set(null);
  }

  async deploy() {
    await this.act(
      () => this.#cloud.deployPages(this.name()),
      `Deploying ${this.productionBranch()} — the build takes a minute.`,
    );
  }

  async rollback(deploymentId: string) {
    await this.act(
      () => this.#cloud.rollbackPages(this.name(), deploymentId),
      'Rolled back. The previous deployment is still in the history.',
    );
  }

  private async act(run: () => Promise<unknown>, success: string) {
    this.acting.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await run();
      this.notice.set(success);
      this.pending.set(null);
      // The listing the server memoized is now wrong by definition.
      await this.load(true);
    } catch (error: unknown) {
      this.error.set(
        error instanceof Error ? error.message : 'The action failed',
      );
    } finally {
      this.acting.set(false);
    }
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
