import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
} from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { VoltButton, VoltCard, VoltCardContent } from '@voltui/components';
import { CloudflareAccount, type CloudStatus } from '@org/core';

/**
 * Everything the Cloud pages must answer before they can show anything:
 * still asking, not an administrator, no account connected, or go ahead.
 *
 * Shared rather than repeated per page — the connect instructions are the part
 * that would drift, and they are the difference between a working section and a
 * dead one.
 */
@Component({
  selector: 'app-cloud-gate',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule, VoltButton, VoltCard, VoltCardContent],
  template: `
    @if (status(); as state) {
      @if (!state.admin) {
        <volt-card>
          <volt-card-content class="py-12 text-center space-y-2">
            <lucide-icon
              name="alert-circle"
              class="w-8 h-8 mx-auto text-muted-foreground"
            />
            @if (state.reason === 'unavailable') {
              <h3 class="text-lg font-medium">Identity service unavailable</h3>
              <p class="text-muted-foreground">
                This server has no <code>DEV_AUTH_ADMIN_TOKEN</code>, so it
                cannot check who administers the platform.
              </p>
            } @else {
              <h3 class="text-lg font-medium">Administrators only</h3>
              <p class="text-muted-foreground">
                This section reads the whole Cloudflare account, so it is
                limited to the platform's administrators.
              </p>
            }
          </volt-card-content>
        </volt-card>
      } @else if (!state.configured) {
        <volt-card>
          <volt-card-content class="py-10 space-y-6 max-w-2xl mx-auto">
            <div class="text-center space-y-2">
              <lucide-icon
                name="cloud"
                class="w-8 h-8 mx-auto text-muted-foreground"
              />
              <h3 class="text-lg font-medium">
                Connect your Cloudflare account
              </h3>
              @if (state.canConnect) {
                <p class="text-muted-foreground">
                  DevFlare will ask Cloudflare for read access to your Workers,
                  D1, KV and R2, and for permission to deploy Pages. You approve
                  it on Cloudflare and can revoke it there at any time. Nothing
                  is stored in your browser.
                </p>
              } @else {
                <p class="text-muted-foreground">
                  DevFlare needs an API token to read what you have deployed. It
                  stays on the server and is never sent to the browser.
                </p>
              }
            </div>

            @if (state.canConnect) {
              <div class="flex justify-center">
                <volt-button (click)="connect()">
                  <lucide-icon name="cloud" class="w-4 h-4 mr-2" />
                  Connect with Cloudflare
                </volt-button>
              </div>
            }

            <details
              class="text-sm text-muted-foreground"
              [open]="!state.canConnect"
            >
              <summary class="cursor-pointer hover:text-foreground">
                Use an API token instead
              </summary>
              <ol class="space-y-2 list-decimal list-inside mt-3">
                <li>
                  Create a token at
                  <a
                    href="https://dash.cloudflare.com/profile/api-tokens"
                    target="_blank"
                    rel="noreferrer"
                    class="text-primary hover:underline"
                    >dash.cloudflare.com/profile/api-tokens</a
                  >
                </li>
                <li>
                  Give it these account permissions: Workers Scripts (Read),
                  Cloudflare Pages (Edit), D1 (Read), Workers KV Storage (Read),
                  Workers R2 Storage (Read)
                </li>
                <li>
                  Store it as <code>CLOUDFLARE_API_TOKEN</code> — in
                  <code>apps/devflare/.dev.vars</code> locally, or with
                  <code>wrangler secret put CLOUDFLARE_API_TOKEN</code> for a
                  deployed environment
                </li>
                <li>Restart the server and reload this page</li>
              </ol>
            </details>
          </volt-card-content>
        </volt-card>
      } @else {
        @if (state.connection.needsReconnect) {
          <div
            class="mb-4 flex items-start gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
          >
            <lucide-icon
              name="alert-circle"
              class="w-4 h-4 mt-0.5 text-amber-600 shrink-0"
            />
            <div class="space-y-2">
              <p>
                The Cloudflare connection can no longer be renewed — it was
                probably revoked from the dashboard. This section is running on
                the server's API token until you connect again.
              </p>
              @if (state.canConnect) {
                <volt-button variant="outline" size="sm" (click)="connect()">
                  Reconnect
                </volt-button>
              }
            </div>
          </div>
        }
        <ng-content />
      }
    } @else {
      <div class="flex items-center justify-center py-12">
        <lucide-icon
          name="loader"
          class="animate-spin w-8 h-8 text-muted-foreground"
        />
      </div>
    }
  `,
})
export class CloudGate {
  #cloud = inject(CloudflareAccount);

  /** Null while the answer is still in flight. */
  readonly status = input.required<CloudStatus | null>();

  /**
   * A full navigation, not a fetch: the flow ends on Cloudflare's consent
   * screen, which cannot be reached with XHR.
   */
  connect(): void {
    window.location.href = this.#cloud.connectUrl;
  }
}
