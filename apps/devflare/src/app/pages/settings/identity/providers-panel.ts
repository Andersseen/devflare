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
import { DevAuthAdminService } from '@org/core';

/**
 * Upstream identity providers dev-auth itself offers — how someone proves who
 * they are — as distinct from Applications (the OAuth consumers that trust
 * that proof). GitHub and email/password are authentication methods;
 * DevFlare/Imageryx/Ally are not providers, they are clients.
 */
@Component({
  selector: 'app-identity-providers-panel',
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
    @if (admin.error()) {
      <volt-error class="mb-4">{{ admin.error() }}</volt-error>
    }

    <!-- GitHub sign-in -->
    <volt-card class="mb-4">
      <volt-card-header>
        <volt-card-title>GitHub</volt-card-title>
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

    <!-- Email + password -->
    <volt-card class="mb-4">
      <volt-card-header>
        <volt-card-title>Email + Password</volt-card-title>
      </volt-card-header>
      <volt-card-content class="space-y-1">
        <div class="flex items-center justify-between">
          <span class="text-sm">Status</span>
          <strong class="text-sm">{{
            admin.settings()?.emailPassword?.enabled ? 'enabled' : 'disabled'
          }}</strong>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-sm">Email verification</span>
          <strong class="text-sm">{{
            admin.settings()?.emailPassword?.requireEmailVerification
              ? 'required'
              : 'not required'
          }}</strong>
        </div>
        <p class="text-xs text-muted-foreground pt-1">
          Verification stays off until a transactional email provider is wired
          up (below) — there is nowhere to send the link yet.
        </p>
      </volt-card-content>
    </volt-card>

    <!-- Transactional email -->
    <volt-card class="mb-4">
      <volt-card-header>
        <volt-card-title>Transactional email</volt-card-title>
      </volt-card-header>
      <volt-card-content>
        <div class="flex items-center justify-between">
          <span class="text-sm">Status</span>
          <strong class="text-sm">{{
            admin.settings()?.transactionalEmail?.configured
              ? 'configured'
              : 'not configured'
          }}</strong>
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
export class ProvidersPanel {
  readonly admin = inject(DevAuthAdminService);

  readonly busy = signal(false);
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
}
