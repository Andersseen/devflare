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
import {
  CloudflareAccount,
  formatBytes,
  formatRelative,
  type CloudStorage,
} from '@org/core';
import { CloudGate } from './cloud-gate';

/**
 * The data side of the account: D1 databases, KV namespaces, R2 buckets.
 *
 * Each product is reported separately because each is a separate token
 * permission — a token without R2 access still shows the databases, with the
 * refusal printed against R2 rather than swallowing the whole page.
 */
@Component({
  selector: 'app-cloud-storage-page',
  imports: [
    LucideAngularModule,
    VoltCard,
    VoltCardHeader,
    VoltCardTitle,
    VoltCardContent,
    VoltButton,
    VoltError,
    CloudGate,
  ],
  template: `
    <div class="space-y-6">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h1 class="text-3xl font-bold tracking-tight">Storage</h1>
          <p class="text-muted-foreground mt-1">
            Databases, namespaces and buckets on your account
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

      <app-cloud-gate [status]="status()">
        @if (error()) {
          <volt-error class="mb-4">{{ error() }}</volt-error>
        }

        @if (loading() && !storage()) {
          <div class="flex items-center justify-center py-12">
            <lucide-icon
              name="loader"
              class="animate-spin w-8 h-8 text-muted-foreground"
            />
          </div>
        } @else if (storage(); as data) {
          <div class="space-y-6">
            <volt-card>
              <volt-card-header
                class="flex flex-row items-center justify-between"
              >
                <volt-card-title class="flex items-center gap-2">
                  <lucide-icon
                    name="database"
                    class="w-5 h-5 text-emerald-500"
                  />
                  D1
                </volt-card-title>
                <span class="text-sm text-muted-foreground"
                  >{{ data.d1.items.length }} databases</span
                >
              </volt-card-header>
              <volt-card-content>
                @if (data.d1.error) {
                  <volt-error>{{ data.d1.error }}</volt-error>
                } @else if (data.d1.items.length === 0) {
                  <p class="text-muted-foreground py-6 text-center">
                    No databases yet.
                  </p>
                } @else {
                  <ul class="divide-y divide-border">
                    @for (database of data.d1.items; track database.id) {
                      <li class="py-3 flex items-center justify-between gap-3">
                        <div class="min-w-0">
                          <p class="font-medium truncate">
                            {{ database.name }}
                          </p>
                          <p class="text-xs text-muted-foreground font-mono">
                            {{ database.id }}
                          </p>
                        </div>
                        <div
                          class="text-sm text-muted-foreground whitespace-nowrap text-right"
                        >
                          <div>{{ bytes(database.sizeBytes) }}</div>
                          @if (database.tables !== null) {
                            <div class="text-xs">
                              {{ database.tables }} tables
                            </div>
                          }
                        </div>
                      </li>
                    }
                  </ul>
                }
              </volt-card-content>
            </volt-card>

            <volt-card>
              <volt-card-header
                class="flex flex-row items-center justify-between"
              >
                <volt-card-title class="flex items-center gap-2">
                  <lucide-icon name="boxes" class="w-5 h-5 text-violet-500" />
                  KV
                </volt-card-title>
                <span class="text-sm text-muted-foreground"
                  >{{ data.kv.items.length }} namespaces</span
                >
              </volt-card-header>
              <volt-card-content>
                @if (data.kv.error) {
                  <volt-error>{{ data.kv.error }}</volt-error>
                } @else if (data.kv.items.length === 0) {
                  <p class="text-muted-foreground py-6 text-center">
                    No namespaces yet.
                  </p>
                } @else {
                  <ul class="divide-y divide-border">
                    @for (namespace of data.kv.items; track namespace.id) {
                      <li class="py-3">
                        <p class="font-medium truncate">{{ namespace.name }}</p>
                        <p class="text-xs text-muted-foreground font-mono">
                          {{ namespace.id }}
                        </p>
                      </li>
                    }
                  </ul>
                }
              </volt-card-content>
            </volt-card>

            <volt-card>
              <volt-card-header
                class="flex flex-row items-center justify-between"
              >
                <volt-card-title class="flex items-center gap-2">
                  <lucide-icon
                    name="hard-drive"
                    class="w-5 h-5 text-orange-500"
                  />
                  R2
                </volt-card-title>
                <span class="text-sm text-muted-foreground"
                  >{{ data.r2.items.length }} buckets</span
                >
              </volt-card-header>
              <volt-card-content>
                @if (data.r2.error) {
                  <volt-error>{{ data.r2.error }}</volt-error>
                } @else if (data.r2.items.length === 0) {
                  <p class="text-muted-foreground py-6 text-center">
                    No buckets yet.
                  </p>
                } @else {
                  <ul class="divide-y divide-border">
                    @for (bucket of data.r2.items; track bucket.name) {
                      <li class="py-3 flex items-center justify-between gap-3">
                        <p class="font-medium truncate">{{ bucket.name }}</p>
                        <span
                          class="text-sm text-muted-foreground whitespace-nowrap"
                        >
                          @if (bucket.location) {
                            {{ bucket.location }} ·
                          }
                          created {{ relative(bucket.createdAt) }}
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
export default class CloudStoragePage {
  #cloud = inject(CloudflareAccount);

  status = this.#cloud.status;
  storage = signal<CloudStorage | null>(null);
  loading = signal(true);
  error = signal('');

  protected readonly relative = formatRelative;
  protected readonly bytes = formatBytes;

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
      const status = await this.#cloud.loadStatus();
      if (status.admin && status.configured) {
        this.storage.set(await this.#cloud.loadStorage(refresh));
      }
    } catch (error: unknown) {
      this.error.set(
        error instanceof Error ? error.message : 'Failed to load storage',
      );
    } finally {
      this.loading.set(false);
    }
  }
}
