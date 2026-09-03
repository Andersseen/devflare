import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import {
  VoltCard,
  VoltCardHeader,
  VoltCardTitle,
  VoltCardContent,
  VoltButton,
  VoltError,
} from '@voltui/components';
import { DevAuthAdminService, type AdminSession } from '@org/core';

/**
 * Live DevAuth sessions. Only fields better-auth actually records are shown —
 * no device fingerprinting or UA parsing on top of what's stored.
 */
@Component({
  selector: 'app-identity-sessions-panel',
  imports: [
    DatePipe,
    LucideAngularModule,
    VoltCard,
    VoltCardHeader,
    VoltCardTitle,
    VoltCardContent,
    VoltButton,
    VoltError,
  ],
  template: `
    <volt-card>
      <volt-card-header>
        <volt-card-title>Sessions</volt-card-title>
      </volt-card-header>
      <volt-card-content class="space-y-4">
        <div class="flex justify-between items-center">
          <p class="text-sm text-muted-foreground">
            Active DevAuth sessions across every user. Revoking one signs that
            browser out on its next request — an already-cached session cookie
            can take up to five minutes to actually stop working.
          </p>
          <volt-button
            variant="outline"
            size="sm"
            [disabled]="admin.loading()"
            (click)="refresh()"
            >Refresh</volt-button
          >
        </div>

        @if (admin.error()) {
          <volt-error>{{ admin.error() }}</volt-error>
        }

        @for (session of admin.sessions(); track session.id) {
          <div class="rounded-md border border-border p-4 space-y-2">
            <div class="flex items-start justify-between gap-4">
              <div class="min-w-0">
                <h4 class="font-medium truncate">
                  {{ session.userName || session.userEmail || session.userId }}
                </h4>
                <p class="text-sm text-muted-foreground truncate">
                  {{ session.userEmail || '—' }}
                </p>
                <p class="mt-1 text-xs text-muted-foreground">
                  Created {{ session.createdAt | date: 'medium' }} · Expires
                  {{ session.expiresAt | date: 'medium' }}
                </p>
                <p class="text-xs text-muted-foreground font-mono">
                  {{ session.ipAddress || '—' }} ·
                  {{ session.userAgent || '—' }}
                </p>
              </div>

              <div class="flex shrink-0 gap-2">
                <volt-button
                  variant="outline"
                  size="sm"
                  [disabled]="busy()"
                  (click)="revoke(session)"
                  >Revoke</volt-button
                >
                <volt-button
                  variant="ghost"
                  size="sm"
                  [disabled]="busy()"
                  (click)="revokeAllForUser(session)"
                  >Revoke all for user</volt-button
                >
              </div>
            </div>
          </div>
        } @empty {
          @if (!admin.loading()) {
            <p class="text-sm text-muted-foreground">No active sessions.</p>
          }
        }
      </volt-card-content>
    </volt-card>
  `,
})
export class SessionsPanel {
  readonly admin = inject(DevAuthAdminService);
  readonly busy = signal(false);

  constructor() {
    void this.admin.loadSessions();
  }

  refresh(): void {
    void this.admin.loadSessions();
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

  revoke(session: AdminSession): Promise<void> {
    return this.run(async () => {
      await this.admin.revokeSession(session.id);
      await this.admin.loadSessions();
    });
  }

  revokeAllForUser(session: AdminSession): Promise<void> {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        `Revoke every session for ${session.userEmail || session.userId}? They will be signed out everywhere.`,
      )
    ) {
      return Promise.resolve();
    }

    return this.run(async () => {
      await this.admin.revokeUserSessions(session.userId);
      await this.admin.loadSessions();
    });
  }
}
