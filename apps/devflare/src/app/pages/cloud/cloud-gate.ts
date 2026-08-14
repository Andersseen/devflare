import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { VoltCard, VoltCardContent } from '@voltui/components';
import type { CloudStatus } from '@org/core';

/**
 * Everything the Cloud pages must answer before they can show anything:
 * still asking, not an administrator, no token wired up, or go ahead.
 *
 * Shared rather than repeated per page — the connect instructions are the part
 * that would drift, and they are the difference between a working section and a
 * dead one.
 */
@Component({
  selector: 'app-cloud-gate',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule, VoltCard, VoltCardContent],
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
          <volt-card-content class="py-10 space-y-4 max-w-2xl mx-auto">
            <div class="text-center space-y-2">
              <lucide-icon
                name="cloud"
                class="w-8 h-8 mx-auto text-muted-foreground"
              />
              <h3 class="text-lg font-medium">
                Connect your Cloudflare account
              </h3>
              <p class="text-muted-foreground">
                DevFlare needs an API token to read what you have deployed. It
                stays on the server and is never sent to the browser.
              </p>
            </div>

            <ol
              class="text-sm text-muted-foreground space-y-2 list-decimal list-inside"
            >
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
          </volt-card-content>
        </volt-card>
      } @else {
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
  /** Null while the answer is still in flight. */
  readonly status = input.required<CloudStatus | null>();
}
