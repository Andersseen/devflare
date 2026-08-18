import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import {
  VoltButton,
  VoltCard,
  VoltCardContent,
  VoltCardHeader,
  VoltCardTitle,
  VoltError,
  VoltInput,
} from '@voltui/components';
import { CloudflareAccount, formatRelative } from '@org/core';

/**
 * The Cloudflare account, administered from Settings instead of only from
 * /cloud (spec 010).
 *
 * It lives in the Integrations tab rather than next to "GitHub sign-in" in
 * Identity, and the distinction is worth keeping: Identity is a remote control
 * for dev-auth, which serves other apps too, while this grant belongs to
 * DevFlare alone. Cloudflare also cannot be a sign-in provider here at all —
 * its discovery document advertises `claims_supported: ["sub"]`, so it can
 * authorize API calls and can never say who someone is.
 *
 * Everything below is admin-only, decided by the server (/api/v1/cloud/status)
 * rather than here: the section reads and rewrites the credential for the whole
 * account.
 */
@Component({
  selector: 'app-cloudflare-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    LucideAngularModule,
    VoltButton,
    VoltCard,
    VoltCardContent,
    VoltCardHeader,
    VoltCardTitle,
    VoltError,
    VoltInput,
  ],
  template: `
    @if (cloud.status(); as state) {
      @if (state.admin) {
        @if (error()) {
          <volt-error class="mb-4">{{ error() }}</volt-error>
        }

        <!-- The connection itself -->
        <volt-card class="mb-4">
          <volt-card-header>
            <volt-card-title>Cloudflare account</volt-card-title>
          </volt-card-header>
          <volt-card-content class="space-y-4">
            @if (connection(); as conn) {
              @switch (conn.kind) {
                @case ('oauth') {
                  <div class="space-y-1">
                    <p class="text-sm">
                      Connected as
                      <strong>{{ conn.accountName || conn.accountId }}</strong>
                      <span class="text-muted-foreground">
                        · {{ since() }}</span
                      >
                    </p>
                    @if (scopes().length) {
                      <div class="flex flex-wrap gap-1 pt-1">
                        @for (scope of scopes(); track scope) {
                          <code
                            class="text-xs rounded bg-muted px-1.5 py-0.5 text-muted-foreground"
                            >{{ scope }}</code
                          >
                        }
                      </div>
                    }
                  </div>
                }
                @case ('token') {
                  <p class="text-sm text-muted-foreground">
                    Running on this server's <code>CLOUDFLARE_API_TOKEN</code>.
                    Connecting the account replaces it with a grant you can
                    revoke from the Cloudflare dashboard.
                  </p>
                }
                @default {
                  <p class="text-sm text-muted-foreground">
                    No Cloudflare account is connected, so the Cloud section has
                    nothing to read.
                  </p>
                }
              }

              @if (conn.needsReconnect) {
                <div
                  class="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
                >
                  <lucide-icon
                    name="alert-circle"
                    class="w-4 h-4 mt-0.5 text-amber-600 shrink-0"
                  />
                  <span>
                    This grant can no longer be renewed — it was probably
                    revoked from the dashboard. Connect again to restore it.
                  </span>
                </div>
              }
            }

            @if (blockers().length) {
              <div class="space-y-1 text-sm text-muted-foreground">
                <p>Connecting is not possible yet:</p>
                <ul class="list-disc list-inside space-y-1">
                  @for (blocker of blockers(); track blocker) {
                    <li>{{ blocker }}</li>
                  }
                </ul>
              </div>
            }

            <div class="flex justify-end gap-2">
              @if (canConnect()) {
                <volt-button size="sm" (click)="connect()">
                  <lucide-icon name="cloud" class="w-4 h-4 mr-2" />
                  {{ connection()?.kind === 'oauth' ? 'Reconnect' : 'Connect' }}
                </volt-button>
              }
              @if (connection()?.kind === 'oauth') {
                <volt-button
                  variant="outline"
                  size="sm"
                  [disabled]="busy()"
                  (click)="disconnect()"
                >
                  Disconnect
                </volt-button>
              }
            </div>
          </volt-card-content>
        </volt-card>

        <!-- The OAuth client the connection is made with -->
        <volt-card>
          <volt-card-header>
            <volt-card-title>Cloudflare OAuth client</volt-card-title>
          </volt-card-header>
          <volt-card-content class="space-y-3">
            <p class="text-sm text-muted-foreground">
              From Manage Account → OAuth clients on Cloudflare. The secret is
              stored encrypted and never shown again; leave it blank to keep the
              current one.
            </p>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label for="cf-client-id" class="block space-y-1">
                <span class="text-sm font-medium">Client ID</span>
                <volt-input
                  id="cf-client-id"
                  [(value)]="clientId"
                  placeholder="32 hex characters"
                />
              </label>
              <label for="cf-client-secret" class="block space-y-1">
                <span class="text-sm font-medium">Client secret</span>
                <volt-input
                  id="cf-client-secret"
                  type="password"
                  [(value)]="clientSecret"
                  [placeholder]="secretPlaceholder()"
                />
              </label>
            </div>

            <p class="text-sm text-muted-foreground">
              Redirect URI to register on that client — compared byte for byte:
              <code class="break-all">{{
                cloud.oauthClient()?.redirectUri ||
                  'not configured on this server'
              }}</code>
            </p>

            @if (cloud.oauthClient(); as client) {
              @if (!client.encryptionKeyConfigured) {
                <p class="text-sm text-amber-600">
                  <code>SECRET_ENCRYPTION_KEY</code> is not set on this server,
                  so a secret cannot be stored. Set it with
                  <code>wrangler secret put SECRET_ENCRYPTION_KEY</code>.
                </p>
              } @else if (client.secretUnreadable) {
                <p class="text-sm text-amber-600">
                  The stored secret cannot be decrypted with this server's
                  <code>SECRET_ENCRYPTION_KEY</code> — it was probably rotated.
                  Enter the secret again.
                </p>
              }

              <div class="flex items-center justify-between gap-3">
                <span class="text-sm text-muted-foreground">
                  {{ sourceLabel(client.source) }}
                </span>
                <div class="flex gap-2">
                  @if (client.source === 'database') {
                    <volt-button
                      variant="outline"
                      size="sm"
                      [disabled]="busy()"
                      (click)="clearClient()"
                    >
                      Use the environment
                    </volt-button>
                  }
                  <volt-button
                    variant="solid"
                    size="sm"
                    [disabled]="busy()"
                    (click)="saveClient()"
                  >
                    Save
                  </volt-button>
                </div>
              </div>
            }

            <p class="text-xs text-muted-foreground">
              A grant belongs to the client that made it: changing the client id
              leaves an existing connection unrenewable, so connect again after
              saving one.
            </p>
          </volt-card-content>
        </volt-card>
      }
    }
  `,
})
export class CloudflareSection {
  readonly cloud = inject(CloudflareAccount);

  readonly busy = signal(false);
  readonly error = signal('');

  readonly clientId = signal('');
  readonly clientSecret = signal('');

  readonly connection = computed(() => this.cloud.status()?.connection ?? null);

  /** Offered whenever the server says it could run the flow. */
  readonly canConnect = computed(() =>
    Boolean(this.cloud.status()?.canConnect),
  );

  readonly scopes = computed(() =>
    (this.connection()?.scope ?? '').split(' ').filter(Boolean),
  );

  readonly since = computed(() =>
    formatRelative(this.connection()?.connectedAt ?? null),
  );

  /**
   * Why there is no connect button. The server reduces the whole question to
   * `canConnect`, which is the right answer for the Cloud pages and a useless
   * one here — this is the page where the missing piece is supposed to be
   * fixed, so it has to be named.
   */
  readonly blockers = computed(() => {
    const status = this.cloud.status();
    const client = this.cloud.oauthClient();
    if (!status || !client || status.canConnect) return [];

    const missing: string[] = [];

    if (client.source === 'none') {
      missing.push('no OAuth client is configured — enter one below');
    }
    if (client.secretUnreadable) {
      missing.push(
        'the stored client secret cannot be decrypted with this server’s key',
      );
    }
    if (!client.encryptionKeyConfigured) {
      missing.push('SECRET_ENCRYPTION_KEY is not set on this server');
    }
    if (!client.redirectUri) {
      missing.push('CLOUDFLARE_OAUTH_REDIRECT_URI is not set on this server');
    }

    return missing;
  });

  readonly secretPlaceholder = computed(() =>
    this.cloud.oauthClient()?.secretConfigured
      ? 'configured — leave blank to keep'
      : 'not configured',
  );

  constructor() {
    void this.load();
  }

  sourceLabel(source: string): string {
    switch (source) {
      case 'database':
        return 'In use: the client saved here.';
      case 'environment':
        return "In use: this deployment's environment variables.";
      default:
        return 'No client configured.';
    }
  }

  /**
   * The status decides whether anything renders at all, so a non-administrator
   * never asks for the client — that request would only 403.
   */
  private async load(): Promise<void> {
    try {
      const status = await this.cloud.loadStatus();
      if (!status.admin) return;

      const client = await this.cloud.loadOAuthClient();
      this.clientId.set(client.clientId ?? '');
    } catch (error) {
      this.error.set(messageOf(error));
    }
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await action();
    } catch (error) {
      this.error.set(messageOf(error));
    } finally {
      this.busy.set(false);
    }
  }

  connect(): void {
    // A full navigation: the flow ends on Cloudflare's consent screen, which
    // cannot be reached with XHR. It returns to /cloud, where the outcome is
    // already rendered.
    window.location.href = this.cloud.connectUrl;
  }

  disconnect(): Promise<void> {
    return this.run(() => this.cloud.disconnect().then(() => undefined));
  }

  saveClient(): Promise<void> {
    return this.run(async () => {
      const client = await this.cloud.saveOAuthClient({
        clientId: this.clientId(),
        clientSecret: this.clientSecret(),
      });
      // Written once and never echoed back, so the field is emptied rather than
      // left holding a secret the page has no further use for.
      this.clientSecret.set('');
      this.clientId.set(client.clientId ?? '');
    });
  }

  clearClient(): Promise<void> {
    return this.run(async () => {
      const client = await this.cloud.clearOAuthClient();
      this.clientId.set(client.clientId ?? '');
      this.clientSecret.set('');
    });
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong';
}
