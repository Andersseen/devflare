import { Component, inject, signal } from '@angular/core';
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
 * Administering dev-auth from DevFlare: which applications may use the SSO,
 * whether GitHub sign-in is on, and who may create an account.
 *
 * All of it goes through DevFlare's own server (see server/routes/api/admin),
 * which forwards to the provider with a service token. Nothing here holds a
 * credential for dev-auth, and this component never renders a credential form
 * for *end users* — sign-in stays hosted on the provider.
 */
@Component({
  selector: 'app-identity-section',
  imports: [
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
    @if (admin.loading()) {
      <div class="flex items-center gap-2 text-muted-foreground py-8">
        <lucide-icon name="loader" class="animate-spin w-4 h-4" />
        Loading identity settings…
      </div>
    }

    @if (admin.error()) {
      <volt-error class="mb-4">{{ admin.error() }}</volt-error>
    }

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

    <!-- Applications -->
    <volt-card class="mb-4">
      <volt-card-header>
        <volt-card-title>Applications</volt-card-title>
      </volt-card-header>
      <volt-card-content class="space-y-4">
        <p class="text-sm text-muted-foreground">
          Apps allowed to sign users in through dev-auth. Redirect URIs are
          matched exactly — a trailing slash is a different URI.
        </p>

        @for (client of admin.clients(); track client.clientId) {
          <div class="rounded-md border border-border p-4 space-y-2">
            <div class="flex items-start justify-between gap-4">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
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
              </div>

              @if (!client.readOnly) {
                <div class="flex shrink-0 gap-2">
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

    <!-- GitHub sign-in -->
    <volt-card class="mb-4">
      <volt-card-header>
        <volt-card-title>GitHub sign-in</volt-card-title>
      </volt-card-header>
      <volt-card-content class="space-y-3">
        <p class="text-sm text-muted-foreground">
          Credentials from the GitHub OAuth App. The secret is stored encrypted
          and never shown again; leave it blank to keep the current one.
        </p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label for="github-client-id" class="block space-y-1">
            <span class="text-sm font-medium">Client ID</span>
            <volt-input
              id="github-client-id"
              [(value)]="githubClientId"
              placeholder="Ov23…"
            />
          </label>
          <label for="github-client-secret" class="block space-y-1">
            <span class="text-sm font-medium">Client secret</span>
            <volt-input
              type="password"
              id="github-client-secret"
              [(value)]="githubClientSecret"
              [placeholder]="
                admin.settings()?.github?.secretConfigured
                  ? 'configured — leave blank to keep'
                  : 'not configured'
              "
            />
          </label>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-sm">
            Status:
            <strong>{{
              admin.settings()?.github?.enabled ? 'enabled' : 'disabled'
            }}</strong>
          </span>
          <div class="flex gap-2">
            <volt-button
              variant="outline"
              size="sm"
              (click)="toggleGithub()"
              [disabled]="busy()"
            >
              {{ admin.settings()?.github?.enabled ? 'Disable' : 'Enable' }}
            </volt-button>
            <volt-button
              variant="solid"
              size="sm"
              (click)="saveGithub()"
              [disabled]="busy()"
              >Save</volt-button
            >
          </div>
        </div>
      </volt-card-content>
    </volt-card>

    <!-- Access -->
    <volt-card>
      <volt-card-header>
        <volt-card-title>Who can sign up</volt-card-title>
      </volt-card-header>
      <volt-card-content class="space-y-3">
        <p class="text-sm text-muted-foreground">
          One address per line. An empty list closes sign-ups entirely; existing
          accounts keep working.
        </p>
        <label for="allowlist" class="block space-y-1">
          <span class="text-sm font-medium"
            >Allowed addresses — one per line</span
          >
          <volt-textarea
            id="allowlist"
            [(value)]="allowlist"
            [rows]="4"
            placeholder="you@example.com"
          />
        </label>
        <div class="flex justify-end">
          <volt-button
            variant="solid"
            size="sm"
            (click)="saveAllowlist()"
            [disabled]="busy()"
            >Save access list</volt-button
          >
        </div>
      </volt-card-content>
    </volt-card>
  `,
})
export class IdentitySection {
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

  readonly githubClientId = signal('');
  readonly githubClientSecret = signal('');
  readonly allowlist = signal('');

  constructor() {
    void this.refresh();
  }

  private async refresh(): Promise<void> {
    await this.admin.loadAll();
    const settings = this.admin.settings();
    if (settings) {
      this.githubClientId.set(settings.github.clientId);
      this.allowlist.set(settings.signup.allowlist.join('\n'));
    }
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
      await this.refresh();
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
      await this.refresh();
    });
  }

  rotate(client: AdminClient): Promise<void> {
    return this.run(async () => {
      this.issuedSecret.set(await this.admin.rotateSecret(client.clientId));
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
      await this.refresh();
    });
  }

  saveGithub(): Promise<void> {
    return this.run(async () => {
      const secret = this.githubClientSecret().trim();
      await this.admin.saveGithub({
        clientId: this.githubClientId().trim(),
        // Blank means "keep the current one" — sending an empty string would
        // read as an attempt to set one.
        ...(secret ? { clientSecret: secret } : {}),
      });
      this.githubClientSecret.set('');
      await this.refresh();
    });
  }

  toggleGithub(): Promise<void> {
    return this.run(async () => {
      await this.admin.saveGithub({
        enabled: !this.admin.settings()?.github?.enabled,
      });
      await this.refresh();
    });
  }

  saveAllowlist(): Promise<void> {
    return this.run(async () => {
      await this.admin.saveAllowlist(this.lines(this.allowlist()));
      await this.refresh();
    });
  }

  async copy(value: string): Promise<void> {
    await navigator.clipboard.writeText(value);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }
}
