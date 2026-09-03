import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import {
  VoltCard,
  VoltCardHeader,
  VoltCardTitle,
  VoltCardContent,
  VoltInput,
  VoltTextarea,
  VoltButton,
  VoltError,
} from '@voltui/components';
import { DevAuthAdminService, type AdminClient } from '@org/core';

/**
 * OAuth consumer applications registered with dev-auth — DevFlare, Imageryx,
 * Ally and anything created here. Distinct from Providers (the upstream
 * sign-in methods dev-auth itself offers): this tab is about who may use the
 * SSO, not how someone proves who they are.
 */
@Component({
  selector: 'app-identity-applications-panel',
  imports: [
    DatePipe,
    FormsModule,
    LucideAngularModule,
    VoltCard,
    VoltCardHeader,
    VoltCardTitle,
    VoltCardContent,
    VoltInput,
    VoltTextarea,
    VoltButton,
    VoltError,
  ],
  template: `
    @if (issuedSecret(); as issued) {
      <volt-card class="mb-4 border-amber-500/40">
        <volt-card-header>
          <volt-card-title>Copy this secret now</volt-card-title>
        </volt-card-header>
        <volt-card-content class="space-y-3">
          <p class="text-sm text-muted-foreground">
            The client secret for <strong>{{ issued.clientId }}</strong> is
            shown once and is stored hashed. It cannot be recovered — rotate it
            if you lose it.
          </p>
          <code
            class="block p-3 rounded-md bg-muted font-mono text-sm break-all"
            >{{ issued.clientSecret }}</code
          >
          <div class="flex justify-end gap-2">
            <volt-button
              variant="outline"
              size="sm"
              (click)="copy(issued.clientSecret)"
            >
              {{ copied() ? 'Copied' : 'Copy' }}
            </volt-button>
            <volt-button
              variant="ghost"
              size="sm"
              (click)="issuedSecret.set(null)"
            >
              Done
            </volt-button>
          </div>
        </volt-card-content>
      </volt-card>
    }

    <volt-card>
      <volt-card-header>
        <volt-card-title>Applications</volt-card-title>
      </volt-card-header>
      <volt-card-content class="space-y-4">
        <p class="text-sm text-muted-foreground">
          Apps allowed to sign users in through dev-auth. Redirect URIs are
          matched exactly — a trailing slash is a different URI.
        </p>

        @if (admin.error()) {
          <volt-error>{{ admin.error() }}</volt-error>
        }

        @for (client of admin.clients(); track client.clientId) {
          <div class="rounded-md border border-border p-4 space-y-2">
            <div class="flex items-start justify-between gap-4">
              <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <h4 class="font-medium truncate">{{ client.name }}</h4>
                  <span
                    class="text-xs px-2 py-0.5 rounded-full"
                    [class]="
                      client.readOnly
                        ? 'bg-muted text-muted-foreground'
                        : 'bg-primary/10 text-primary'
                    "
                    >{{ client.source }}</span
                  >
                  <span
                    class="text-xs px-2 py-0.5 rounded-full"
                    [class]="
                      client.disabled
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    "
                    >{{ client.disabled ? 'disabled' : 'active' }}</span
                  >
                </div>
                <p class="text-sm text-muted-foreground font-mono truncate">
                  {{ client.clientId }}
                </p>
                <ul class="mt-2 space-y-1">
                  @for (uri of client.redirectUris; track uri) {
                    <li
                      class="text-xs font-mono text-muted-foreground break-all"
                    >
                      {{ uri }}
                    </li>
                  }
                </ul>
                <p class="mt-2 text-xs text-muted-foreground">
                  Scopes:
                  {{
                    client.scopes?.join(', ') ||
                      'openid profile email offline_access'
                  }}
                  @if (client.skipConsent) {
                    · first-party (skips consent)
                  }
                  @if (client.enableEndSession) {
                    · supports logout
                  }
                </p>
                @if (client.createdAt) {
                  <p class="text-xs text-muted-foreground">
                    Created {{ client.createdAt | date: 'medium' }}
                    @if (
                      client.updatedAt && client.updatedAt !== client.createdAt
                    ) {
                      · updated {{ client.updatedAt | date: 'medium' }}
                    }
                  </p>
                }
              </div>

              @if (!client.readOnly) {
                <div class="flex shrink-0 gap-2 flex-wrap justify-end">
                  <volt-button
                    variant="outline"
                    size="sm"
                    (click)="startEdit(client)"
                  >
                    Edit URIs
                  </volt-button>
                  <volt-button
                    variant="outline"
                    size="sm"
                    (click)="rotate(client)"
                  >
                    Rotate
                  </volt-button>
                  <volt-button
                    variant="outline"
                    size="sm"
                    (click)="toggleDisabled(client)"
                  >
                    {{ client.disabled ? 'Enable' : 'Disable' }}
                  </volt-button>
                  <volt-button
                    variant="ghost"
                    size="sm"
                    (click)="remove(client)"
                  >
                    Delete
                  </volt-button>
                </div>
              } @else {
                <!-- Registered in wrangler.toml; the API refuses edits, so no
                     control is offered that would only fail. -->
                <span class="text-xs text-muted-foreground shrink-0"
                  >in configuration</span
                >
              }
            </div>

            @if (editing() === client.clientId) {
              <div class="pt-2 space-y-2 border-t border-border">
                <label for="edit-uris" class="block space-y-1">
                  <span class="text-sm font-medium">Redirect URIs</span>
                  <volt-textarea
                    id="edit-uris"
                    [(value)]="editUris"
                    [rows]="3"
                    placeholder="https://app.example.com/auth/callback"
                  />
                </label>
                <div class="flex justify-end gap-2">
                  <volt-button
                    variant="ghost"
                    size="sm"
                    (click)="editing.set(null)"
                    >Cancel</volt-button
                  >
                  <volt-button
                    variant="solid"
                    size="sm"
                    (click)="saveUris(client)"
                    >Save</volt-button
                  >
                </div>
              </div>
            }
          </div>
        } @empty {
          @if (!admin.loading()) {
            <p class="text-sm text-muted-foreground">No applications yet.</p>
          }
        }

        <div class="pt-2 border-t border-border space-y-3">
          <h4 class="font-medium text-sm">Add an application</h4>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label for="new-client-id" class="block space-y-1">
              <span class="text-sm font-medium">Client ID</span>
              <volt-input
                id="new-client-id"
                [(value)]="newClientId"
                placeholder="my-app"
              />
            </label>
            <label for="new-name" class="block space-y-1">
              <span class="text-sm font-medium">Display name</span>
              <volt-input
                id="new-name"
                [(value)]="newName"
                placeholder="My App"
              />
            </label>
          </div>
          <label for="new-redirect-uris" class="block space-y-1">
            <span class="text-sm font-medium"
              >Redirect URIs — one per line</span
            >
            <volt-textarea
              id="new-redirect-uris"
              [(value)]="newRedirectUris"
              [rows]="3"
              placeholder="https://my-app.example.com/auth/callback"
            />
          </label>
          <div class="flex justify-end">
            <volt-button
              variant="solid"
              size="sm"
              (click)="create()"
              [disabled]="busy()"
              >Add application</volt-button
            >
          </div>
        </div>
      </volt-card-content>
    </volt-card>
  `,
})
export class ApplicationsPanel {
  readonly admin = inject(DevAuthAdminService);

  readonly busy = signal(false);
  readonly copied = signal(false);
  readonly issuedSecret = signal<{
    clientId: string;
    clientSecret: string;
  } | null>(null);

  readonly editing = signal<string | null>(null);
  readonly editUris = signal('');

  readonly newClientId = signal('');
  readonly newName = signal('');
  readonly newRedirectUris = signal('');

  constructor() {
    void this.admin.loadAll();
  }

  private lines(value: string): string[] {
    return value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }

  /** Wraps an action so one failure cannot leave the panel stuck in "busy". */
  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.admin.setError('');
    try {
      await action();
    } catch (error) {
      this.admin.setError(
        error instanceof Error ? error.message : 'Something went wrong',
      );
    } finally {
      this.busy.set(false);
    }
  }

  startEdit(client: AdminClient): void {
    this.editing.set(client.clientId);
    this.editUris.set(client.redirectUris.join('\n'));
  }

  saveUris(client: AdminClient): Promise<void> {
    return this.run(async () => {
      await this.admin.updateRedirectUris(
        client.clientId,
        this.lines(this.editUris()),
      );
      this.editing.set(null);
      await this.admin.loadAll();
    });
  }

  create(): Promise<void> {
    return this.run(async () => {
      const issued = await this.admin.createClient({
        clientId: this.newClientId().trim(),
        name: this.newName().trim() || this.newClientId().trim(),
        redirectUris: this.lines(this.newRedirectUris()),
        skipConsent: false,
      });
      this.issuedSecret.set(issued);
      this.newClientId.set('');
      this.newName.set('');
      this.newRedirectUris.set('');
      await this.admin.loadAll();
    });
  }

  rotate(client: AdminClient): Promise<void> {
    return this.run(async () => {
      this.issuedSecret.set(await this.admin.rotateSecret(client.clientId));
    });
  }

  toggleDisabled(client: AdminClient): Promise<void> {
    return this.run(async () => {
      await this.admin.setClientDisabled(client.clientId, !client.disabled);
      await this.admin.loadAll();
    });
  }

  remove(client: AdminClient): Promise<void> {
    // Deleting also revokes the client's tokens, so it is worth a confirmation.
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        `Delete "${client.clientId}"? Its tokens are revoked immediately and any app using it stops working.`,
      )
    ) {
      return Promise.resolve();
    }

    return this.run(async () => {
      await this.admin.deleteClient(client.clientId);
      await this.admin.loadAll();
    });
  }

  async copy(value: string): Promise<void> {
    await navigator.clipboard.writeText(value);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }
}
