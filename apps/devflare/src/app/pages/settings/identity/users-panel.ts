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
  VoltButton,
  VoltError,
} from '@voltui/components';
import { DevAuthAdminService, type AdminUser } from '@org/core';

/**
 * Identities known to dev-auth. Reads the real better-auth user/account
 * tables through dev-auth's admin API — there is no parallel user model here.
 */
@Component({
  selector: 'app-identity-users-panel',
  imports: [
    DatePipe,
    FormsModule,
    LucideAngularModule,
    VoltCard,
    VoltCardHeader,
    VoltCardTitle,
    VoltCardContent,
    VoltInput,
    VoltButton,
    VoltError,
  ],
  template: `
    <volt-card>
      <volt-card-header>
        <volt-card-title>Users</volt-card-title>
      </volt-card-header>
      <volt-card-content class="space-y-4">
        <div class="flex gap-2">
          <volt-input
            [(value)]="query"
            placeholder="Search by name or email…"
            (keyup.enter)="search()"
            class="flex-1"
          />
          <volt-button variant="outline" size="sm" (click)="search()"
            >Search</volt-button
          >
        </div>

        @if (admin.error()) {
          <volt-error>{{ admin.error() }}</volt-error>
        }

        @for (user of admin.users(); track user.id) {
          <div class="rounded-md border border-border p-4 space-y-2">
            <div class="flex items-start justify-between gap-4">
              <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <h4 class="font-medium truncate">
                    {{ user.name || user.email }}
                  </h4>
                  <span
                    class="text-xs px-2 py-0.5 rounded-full"
                    [class]="
                      user.banned
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    "
                    >{{ user.banned ? 'banned' : 'active' }}</span
                  >
                  @if (!user.emailVerified) {
                    <span
                      class="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                      >unverified email</span
                    >
                  }
                </div>
                <p class="text-sm text-muted-foreground truncate">
                  {{ user.email }}
                </p>
                <p class="mt-1 text-xs text-muted-foreground">
                  Providers: {{ user.providers.join(', ') || 'none' }} ·
                  {{ user.sessionCount }} active session{{
                    user.sessionCount === 1 ? '' : 's'
                  }}
                </p>
                <p class="text-xs text-muted-foreground">
                  Created {{ user.createdAt | date: 'medium' }}
                </p>
                @if (user.banned && user.bannedReason) {
                  <p class="text-xs text-destructive">
                    Ban reason: {{ user.bannedReason }}
                  </p>
                }
              </div>

              <div class="flex shrink-0 gap-2">
                @if (user.banned) {
                  <volt-button
                    variant="outline"
                    size="sm"
                    [disabled]="busy()"
                    (click)="unban(user)"
                    >Unban</volt-button
                  >
                } @else {
                  <volt-button
                    variant="ghost"
                    size="sm"
                    [disabled]="busy()"
                    (click)="ban(user)"
                    >Ban</volt-button
                  >
                }
              </div>
            </div>
          </div>
        } @empty {
          @if (!admin.loading()) {
            <p class="text-sm text-muted-foreground">No users found.</p>
          }
        }
      </volt-card-content>
    </volt-card>
  `,
})
export class UsersPanel {
  readonly admin = inject(DevAuthAdminService);
  readonly query = signal('');
  readonly busy = signal(false);

  constructor() {
    void this.admin.loadUsers();
  }

  search(): void {
    void this.admin.loadUsers(this.query().trim() || undefined);
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

  ban(user: AdminUser): Promise<void> {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        `Ban "${user.email}"? They will not be able to sign in again until unbanned. Existing sessions keep working — revoke those separately in the Sessions tab.`,
      )
    ) {
      return Promise.resolve();
    }

    const reason =
      typeof window !== 'undefined'
        ? (window.prompt('Reason (optional):') ?? undefined)
        : undefined;

    return this.run(async () => {
      await this.admin.banUser(user.id, reason || undefined);
      await this.admin.loadUsers(this.query().trim() || undefined);
    });
  }

  unban(user: AdminUser): Promise<void> {
    return this.run(async () => {
      await this.admin.unbanUser(user.id);
      await this.admin.loadUsers(this.query().trim() || undefined);
    });
  }
}
