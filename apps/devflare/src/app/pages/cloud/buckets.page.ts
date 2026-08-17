import { Component, afterNextRender, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import {
  VoltCard,
  VoltCardContent,
  VoltButton,
  VoltError,
} from '@voltui/components';
import { CloudflareAccount, formatRelative, type CloudBucket } from '@org/core';
import { CloudGate } from './cloud-gate';

/**
 * The R2 buckets on the account, each one a way in.
 *
 * Split out of Storage (spec 008): D1 and KV are inventories you read from the
 * outside, while a bucket has contents worth opening, and burying the one
 * navigable resource in a flat list is what made the section feel finished when
 * it was not.
 */
@Component({
  selector: 'app-cloud-buckets-page',
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
        <div>
          <h1 class="text-3xl font-bold tracking-tight">Buckets</h1>
          <p class="text-muted-foreground mt-1">
            R2 object storage on your account
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

        @if (loading() && !buckets().length) {
          <div class="flex items-center justify-center py-12">
            <lucide-icon
              name="loader"
              class="animate-spin w-8 h-8 text-muted-foreground"
            />
          </div>
        } @else {
          <volt-card>
            <volt-card-content class="pt-6">
              @if (buckets().length === 0) {
                <p class="text-muted-foreground py-6 text-center">
                  No buckets on this account yet.
                </p>
              } @else {
                <ul class="divide-y divide-border">
                  @for (bucket of buckets(); track bucket.name) {
                    <li>
                      <a
                        [routerLink]="['/cloud/buckets', bucket.name]"
                        class="flex items-center justify-between gap-3 py-3 group"
                      >
                        <span class="flex items-center gap-3 min-w-0">
                          <lucide-icon
                            name="hard-drive"
                            class="w-4 h-4 text-orange-500 shrink-0"
                          />
                          <span
                            class="font-medium truncate group-hover:text-primary group-hover:underline"
                            >{{ bucket.name }}</span
                          >
                        </span>
                        <span
                          class="text-sm text-muted-foreground whitespace-nowrap"
                        >
                          @if (bucket.location) {
                            {{ bucket.location }} ·
                          }
                          created {{ relative(bucket.createdAt) }}
                        </span>
                      </a>
                    </li>
                  }
                </ul>
              }
            </volt-card-content>
          </volt-card>
        }
      </app-cloud-gate>
    </div>
  `,
})
export default class CloudBucketsPage {
  #cloud = inject(CloudflareAccount);

  status = this.#cloud.status;
  buckets = signal<CloudBucket[]>([]);
  loading = signal(true);
  error = signal('');

  protected readonly relative = formatRelative;

  constructor() {
    // Browser-only: the service fetches a relative URL, which throws under SSR.
    afterNextRender(() => void this.load());
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
        this.buckets.set(await this.#cloud.loadBuckets(refresh));
      }
    } catch (error: unknown) {
      this.error.set(
        error instanceof Error ? error.message : 'Could not read the buckets',
      );
    } finally {
      this.loading.set(false);
    }
  }
}
