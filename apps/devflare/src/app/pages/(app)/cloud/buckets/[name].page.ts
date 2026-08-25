import {
  Component,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import {
  VoltCard,
  VoltCardContent,
  VoltButton,
  VoltError,
} from '@voltui/components';
import {
  CloudflareAccount,
  formatBytes,
  formatRelative,
  type CloudFolder,
  type CloudObject,
} from '@org/core';
import { CloudGate } from '../cloud-gate';

/** One level of the path, and the prefix that gets you back to it. */
interface Crumb {
  name: string;
  prefix: string;
}

/**
 * What is actually inside a bucket, one level at a time.
 *
 * R2 stores flat keys — there are no directories. The folders shown here are
 * the prefixes Cloudflare groups for us when the listing is asked for with a
 * delimiter, so descending is one request rather than a subtree assembled in
 * the browser. That is also why this is a list and not a tree: the API answers
 * per level, and a tree would mean pulling every key in the bucket to render
 * the handful on screen.
 *
 * The current folder lives in `?prefix=`, so back, forward and a shared link
 * all work without this page knowing about any of them.
 */
@Component({
  selector: 'app-cloud-bucket-page',
  imports: [
    RouterLink,
    LucideAngularModule,
    VoltCard,
    VoltCardContent,
    VoltButton,
    VoltError,
    CloudGate,
  ],
  template: `
    <div class="space-y-6">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <a
            routerLink="/cloud/buckets"
            class="text-sm text-muted-foreground hover:text-primary hover:underline"
            >← Buckets</a
          >
          <h1 class="text-3xl font-bold tracking-tight truncate mt-1">
            {{ name() }}
          </h1>

          <!-- Breadcrumb. Every crumb is a prefix, so it is a plain link. -->
          <nav class="flex flex-wrap items-center gap-1 text-sm mt-2">
            <a
              [routerLink]="['/cloud/buckets', name()]"
              [queryParams]="rootQuery"
              class="text-muted-foreground hover:text-primary hover:underline"
              >root</a
            >
            @for (crumb of crumbs(); track crumb.prefix) {
              <span class="text-muted-foreground">/</span>
              @if ($last) {
                <span class="font-medium">{{ crumb.name }}</span>
              } @else {
                <a
                  [routerLink]="['/cloud/buckets', name()]"
                  [queryParams]="{ prefix: crumb.prefix }"
                  class="text-muted-foreground hover:text-primary hover:underline"
                  >{{ crumb.name }}</a
                >
              }
            }
          </nav>
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

      <app-cloud-gate [status]="status()">
        @if (error()) {
          <volt-error class="mb-4">{{ error() }}</volt-error>
        }

        @if (loading() && !folders().length && !objects().length) {
          <div class="flex items-center justify-center py-12">
            <lucide-icon
              name="loader"
              class="animate-spin w-8 h-8 text-muted-foreground"
            />
          </div>
        } @else {
          <volt-card>
            <volt-card-content class="pt-6">
              @if (!folders().length && !objects().length) {
                <p class="text-muted-foreground py-6 text-center">
                  @if (prefix()) {
                    Nothing under this prefix.
                  } @else {
                    This bucket is empty.
                  }
                </p>
              } @else {
                <ul class="divide-y divide-border">
                  <!-- Folders first: they are where you go, not what you read. -->
                  @for (folder of folders(); track folder.prefix) {
                    <li>
                      <a
                        [routerLink]="['/cloud/buckets', name()]"
                        [queryParams]="{ prefix: folder.prefix }"
                        class="flex items-center gap-3 py-3 group"
                      >
                        <lucide-icon
                          name="folder"
                          class="w-4 h-4 text-sky-500 shrink-0"
                        />
                        <span
                          class="font-medium truncate group-hover:text-primary group-hover:underline"
                          >{{ folder.name }}</span
                        >
                      </a>
                    </li>
                  }

                  @for (object of objects(); track object.key) {
                    <li
                      class="flex items-center justify-between gap-3 py-3 min-w-0"
                    >
                      <span class="flex items-center gap-3 min-w-0">
                        <lucide-icon
                          name="file"
                          class="w-4 h-4 text-muted-foreground shrink-0"
                        />
                        <span class="truncate">{{ object.name }}</span>
                      </span>
                      <span
                        class="text-sm text-muted-foreground whitespace-nowrap"
                      >
                        {{ bytes(object.size) }} ·
                        {{ relative(object.lastModified) }}
                      </span>
                    </li>
                  }
                </ul>

                @if (cursor()) {
                  <div class="pt-4 text-center">
                    <volt-button
                      variant="outline"
                      size="sm"
                      [disabled]="loading()"
                      (click)="loadMore()"
                    >
                      Load more
                    </volt-button>
                  </div>
                }
              }
            </volt-card-content>
          </volt-card>
        }
      </app-cloud-gate>
    </div>
  `,
})
export default class CloudBucketPage {
  #cloud = inject(CloudflareAccount);

  /** Both bound from the route by `withComponentInputBinding()`. */
  readonly name = input.required<string>();
  readonly prefix = input('');

  status = this.#cloud.status;
  folders = signal<CloudFolder[]>([]);
  objects = signal<CloudObject[]>([]);
  cursor = signal<string | null>(null);
  loading = signal(true);
  error = signal('');

  protected readonly relative = formatRelative;
  protected readonly bytes = formatBytes;

  /** Stable identity so the root link does not rebuild its params every check. */
  protected readonly rootQuery = {};

  protected readonly crumbs = computed<Crumb[]>(() => {
    const parts = this.prefix().split('/').filter(Boolean);
    return parts.map((part, index) => ({
      name: part,
      prefix: `${parts.slice(0, index + 1).join('/')}/`,
    }));
  });

  /** Set once the browser is running; see the SSR note in the sibling pages. */
  #ready = signal(false);

  constructor() {
    afterNextRender(() => this.#ready.set(true));

    // Reacts to the prefix as well as the bucket: walking into a folder is a
    // navigation to the same route, so nothing is reconstructed and a one-shot
    // load in the constructor would leave the first level on screen forever.
    effect(() => {
      const bucket = this.name();
      const prefix = this.prefix();
      if (this.#ready()) void this.load(bucket, prefix);
    });
  }

  async reload() {
    await this.load(this.name(), this.prefix());
  }

  /** Continues a listing Cloudflare cut short, appending to what is shown. */
  async loadMore() {
    const cursor = this.cursor();
    if (!cursor || this.loading()) return;

    this.loading.set(true);
    try {
      const page = await this.#cloud.loadObjects(
        this.name(),
        this.prefix(),
        cursor,
      );
      this.folders.update((current) => [...current, ...page.folders]);
      this.objects.update((current) => [...current, ...page.objects]);
      this.cursor.set(page.cursor);
    } catch (error: unknown) {
      this.error.set(
        error instanceof Error ? error.message : 'Could not read the bucket',
      );
    } finally {
      this.loading.set(false);
    }
  }

  private async load(bucket: string, prefix: string) {
    this.loading.set(true);
    this.error.set('');
    // Cleared rather than left in place: showing the previous folder's contents
    // under the new breadcrumb would be a lie for as long as the request takes.
    this.folders.set([]);
    this.objects.set([]);
    this.cursor.set(null);

    try {
      const status = await this.#cloud.loadStatus();
      if (!status.admin || !status.configured) return;

      const page = await this.#cloud.loadObjects(bucket, prefix);
      this.folders.set(page.folders);
      this.objects.set(page.objects);
      this.cursor.set(page.cursor);
    } catch (error: unknown) {
      this.error.set(
        error instanceof Error ? error.message : 'Could not read the bucket',
      );
    } finally {
      this.loading.set(false);
    }
  }
}
