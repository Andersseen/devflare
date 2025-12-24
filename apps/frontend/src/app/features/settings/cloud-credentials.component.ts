import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfigService, CloudflareConfig } from '@core-services/config.service';
import { CardComponent } from '@ui-components/card.component';
import { ButtonComponent } from '@ui-components/button.component';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-cloud-credentials',
  imports: [FormsModule, CardComponent, ButtonComponent, RouterLink],
  template: `
    <div class="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <a routerLink="/settings" class="text-text-muted hover:text-text transition-colors"
              >Settings</a
            >
            <span class="text-text-muted">/</span>
            <span class="text-text">Cloud Credentials</span>
          </div>
          <h2 class="text-2xl font-bold text-text">R2 Configuration</h2>
          <p class="text-sm text-text-muted">Manage your Cloudflare R2 credentials.</p>
        </div>
      </div>

      <ui-card>
        <form class="space-y-6">
          <!-- Banner -->
          <div class="bg-primary/5 border border-primary/20 rounded-lg p-4">
            <div class="flex">
              <div class="flex-shrink-0">
                <svg class="h-5 w-5 text-primary" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fill-rule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clip-rule="evenodd"
                  />
                </svg>
              </div>
              <div class="ml-3">
                <p class="text-sm text-primary">
                  These credentials are stored locally in your browser and are used to sign requests
                  to R2 directly.
                </p>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
            <div class="sm:col-span-4">
              <label for="accountId" class="block text-sm font-medium text-text">Account ID</label>
              <div class="mt-1">
                <input
                  type="text"
                  name="accountId"
                  id="accountId"
                  [(ngModel)]="config.accountId"
                  class="block w-full rounded-md border-border shadow-sm focus:border-primary focus:ring-primary bg-background text-text sm:text-sm px-3 py-2"
                />
              </div>
            </div>

            <div class="sm:col-span-6">
              <label for="accessKey" class="block text-sm font-medium text-text"
                >Access Key ID</label
              >
              <div class="mt-1">
                <input
                  type="text"
                  name="accessKey"
                  id="accessKey"
                  [(ngModel)]="config.accessKeyId"
                  class="block w-full rounded-md border-border shadow-sm focus:border-primary focus:ring-primary bg-background text-text sm:text-sm px-3 py-2"
                />
              </div>
            </div>

            <div class="sm:col-span-6">
              <label for="secretKey" class="block text-sm font-medium text-text"
                >Secret Access Key</label
              >
              <div class="mt-1">
                <input
                  type="password"
                  name="secretKey"
                  id="secretKey"
                  [(ngModel)]="config.secretAccessKey"
                  class="block w-full rounded-md border-border shadow-sm focus:border-primary focus:ring-primary bg-background text-text sm:text-sm px-3 py-2"
                />
              </div>
            </div>

            <div class="sm:col-span-4">
              <label for="bucket" class="block text-sm font-medium text-text">Bucket Name</label>
              <div class="mt-1">
                <input
                  type="text"
                  name="bucket"
                  id="bucket"
                  [(ngModel)]="config.bucketName"
                  class="block w-full rounded-md border-border shadow-sm focus:border-primary focus:ring-primary bg-background text-text sm:text-sm px-3 py-2"
                />
              </div>
            </div>
          </div>

          <div class="flex justify-end pt-4 border-t border-border">
            <ui-button (click)="save()">
              @if (saved()) { Saved! } @else { Save Configuration }
            </ui-button>
          </div>
        </form>
      </ui-card>
    </div>
  `,
})
export class CloudCredentialsComponent {
  configService = inject(ConfigService);

  config: CloudflareConfig = {
    accountId: '',
    accessKeyId: '',
    secretAccessKey: '',
    bucketName: '',
  };

  saved = signal(false);

  constructor() {
    const current = this.configService.config();
    if (current) {
      this.config = { ...current };
    }
  }

  save() {
    this.configService.saveConfig(this.config);
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 2000);
  }
}
