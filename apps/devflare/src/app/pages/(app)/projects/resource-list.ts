import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { VoltButton } from '@voltui/components';
import {
  RESOURCE_TYPE_META,
  cloudResourcePath,
  formatBytes,
  formatRelative,
  groupResources,
  type ResolvedResource,
} from '@org/core';
import { DeploymentStatus } from '../cloud/deployment-status';
import { resourceUrls } from '../dashboard-projects';

/**
 * A project's resources, grouped Web / Compute / Storage (spec 019).
 *
 * Every persisted link is shown, whatever Cloudflare says about it: a resource
 * the account no longer lists reads "Missing from Cloudflare account", and one
 * whose product the token cannot read reads "Cannot verify" with Cloudflare's
 * own reason. Hiding either would let DevFlare's record and Cloudflare's drift
 * apart silently.
 *
 * `mode="discovered"` renders a discovered project's resources: nothing is
 * persisted, so there is nothing to unlink.
 */
@Component({
  selector: 'app-resource-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LucideAngularModule, VoltButton, DeploymentStatus],
  template: `
    <div class="space-y-6">
      @for (group of groups(); track group.id) {
        <section [attr.aria-labelledby]="'resources-' + group.id">
          <h3
            [id]="'resources-' + group.id"
            class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            {{ group.label }}
          </h3>
          <ul
            class="divide-y divide-border rounded-md border border-border bg-card"
          >
            @for (
              resource of group.resources;
              track resource.type + ':' + resource.resourceId
            ) {
              <li
                class="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                data-testid="project-resource"
                [attr.data-resource-type]="resource.type"
                [attr.data-resource-state]="resource.state"
              >
                <div class="flex min-w-0 items-start gap-3">
                  <lucide-icon
                    [name]="meta[resource.type].icon"
                    class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                  />
                  <div class="min-w-0 space-y-1">
                    <div class="flex min-w-0 flex-wrap items-center gap-2">
                      <span class="truncate font-medium">{{
                        resource.name
                      }}</span>
                      <span class="text-xs text-muted-foreground">{{
                        meta[resource.type].label
                      }}</span>
                      @switch (resource.state) {
                        @case ('missing') {
                          <span
                            class="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400"
                          >
                            <lucide-icon name="alert-circle" class="h-3 w-3" />
                            Missing from Cloudflare account
                          </span>
                        }
                        @case ('unverifiable') {
                          <span
                            class="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
                          >
                            <lucide-icon name="lock" class="h-3 w-3" />
                            Cannot verify
                          </span>
                        }
                      }
                      @if (resource.detail?.type === 'pages') {
                        @if (pagesDeployment(resource); as deployment) {
                          <app-deployment-status
                            [status]="deployment.status"
                            [stage]="deployment.stage"
                          />
                        }
                      }
                    </div>
                    <p class="truncate text-sm text-muted-foreground">
                      {{ summary(resource) }}
                    </p>
                  </div>
                </div>

                <div class="flex shrink-0 items-center gap-2">
                  @if (resource.state === 'available') {
                    @if (url(resource); as href) {
                      <a
                        [href]="href"
                        target="_blank"
                        rel="noreferrer"
                        class="text-sm text-primary hover:underline"
                        [attr.aria-label]="'Visit ' + resource.name"
                        >Visit</a
                      >
                    }
                    <a
                      [routerLink]="path(resource)"
                      [attr.aria-label]="'Open ' + resource.name + ' in Cloud'"
                    >
                      <volt-button size="sm" variant="outline">
                        <lucide-icon
                          name="external-link"
                          class="mr-1 h-4 w-4"
                        />
                        Open
                      </volt-button>
                    </a>
                  }
                  @if (mode() === 'owned' && resource.link; as link) {
                    <volt-button
                      size="sm"
                      variant="ghost"
                      [disabled]="busy() === link.id"
                      (click)="unlink.emit(resource)"
                    >
                      <lucide-icon
                        name="unlink"
                        class="mr-1 h-4 w-4"
                        [class.animate-pulse]="busy() === link.id"
                      />
                      Unlink<span class="sr-only"
                        >&#32;{{ resource.name }}</span
                      >
                    </volt-button>
                  }
                </div>
              </li>
            }
          </ul>
        </section>
      }
    </div>
  `,
})
export class ResourceList {
  readonly resources = input.required<ResolvedResource[]>();
  readonly mode = input<'owned' | 'discovered'>('owned');
  /** The link id currently being unlinked. */
  readonly busy = input<string | null>(null);
  readonly unlink = output<ResolvedResource>();

  protected readonly meta = RESOURCE_TYPE_META;
  protected readonly groups = computed(() => groupResources(this.resources()));

  protected path(resource: ResolvedResource): string[] {
    return cloudResourcePath(resource.type, resource.resourceId);
  }

  protected url(resource: ResolvedResource): string | null {
    const detail = resource.detail;
    if (detail?.type === 'pages')
      return resourceUrls(detail.pages, null)[0] ?? null;
    if (detail?.type === 'worker') {
      return resourceUrls(null, detail.worker)[0] ?? null;
    }
    return null;
  }

  protected pagesDeployment(resource: ResolvedResource) {
    return resource.detail?.type === 'pages'
      ? resource.detail.pages.latestDeployment
      : null;
  }

  /** One line of what Cloudflare says now — or why it cannot say. */
  protected summary(resource: ResolvedResource): string {
    if (resource.state !== 'available') {
      return resource.state === 'missing'
        ? `${resource.resourceId} is linked here but Cloudflare no longer lists it`
        : (resource.reason ?? 'Cloudflare could not be asked');
    }

    const detail = resource.detail;
    switch (detail?.type) {
      case 'pages':
        return `${
          detail.pages.latestDeployment
            ? `deployed ${formatRelative(detail.pages.latestDeployment.createdOn)}`
            : 'never deployed'
        } · production branch ${detail.pages.productionBranch}`;
      case 'worker':
        return `updated ${formatRelative(detail.worker.modifiedOn)}${
          detail.worker.domains.length
            ? ` · ${detail.worker.domains.join(', ')}`
            : ''
        }`;
      case 'd1':
        return `${formatBytes(detail.database.sizeBytes)} · ${detail.database.id}`;
      case 'kv':
        return detail.namespace.id;
      case 'r2':
        return detail.bucket.location
          ? `${detail.bucket.location} · created ${formatRelative(detail.bucket.createdAt)}`
          : `created ${formatRelative(detail.bucket.createdAt)}`;
      default:
        return resource.resourceId;
    }
  }
}
