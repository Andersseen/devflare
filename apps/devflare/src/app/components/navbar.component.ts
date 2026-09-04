import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { VoltSidebarService } from '@voltui/components';
import { DevAuth } from '@org/auth';
import { DevAuthUserButton } from '@org/auth-ui';
import { injectActiveSection, SHELL_SECTIONS } from './shell-navigation';

@Component({
  selector: 'app-navbar',
  imports: [RouterLink, LucideAngularModule, DevAuthUserButton],
  template: `
    <header
      class="flex h-14 shrink-0 items-center gap-1 border-b border-border bg-card px-4"
    >
      <!-- Mobile: open the sidebar as a slide-over -->
      <button
        (click)="sidebarService.toggleMobile()"
        class="mr-1 flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
        aria-label="Open sidebar"
      >
        <lucide-icon name="menu" class="h-5 w-5" />
      </button>

      <a routerLink="/" class="flex items-center gap-2">
        <span
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground"
        >
          DF
        </span>
        <span class="text-lg font-bold">DevFlare</span>
      </a>

      <nav
        class="ml-6 hidden h-full items-center sm:flex"
        aria-label="Sections"
      >
        @for (section of sections; track section.id) {
          <a
            [routerLink]="section.link"
            class="relative flex h-full items-center px-3 text-sm font-medium transition-colors"
            [class]="
              section.id === activeSection().id
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            "
            [attr.aria-current]="
              section.id === activeSection().id ? 'page' : null
            "
          >
            {{ section.label }}
            @if (section.id === activeSection().id) {
              <span
                class="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary"
              ></span>
            }
          </a>
        }
      </nav>

      <div class="ml-auto flex items-center gap-2">
        @if (auth.isAuthenticated()) {
          <dev-auth-user-button
            class="[--dev-auth-surface:var(--popover)] [--dev-auth-foreground:var(--popover-foreground)] [--dev-auth-muted:var(--muted-foreground)] [--dev-auth-border:var(--border)] [--dev-auth-focus:var(--ring)]"
          >
            <a
              devAuthUserMenuActions
              role="menuitem"
              routerLink="/settings"
              class="flex min-h-11 w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
            >
              <lucide-icon name="settings" class="h-4 w-4" />
              Settings
            </a>
          </dev-auth-user-button>
        } @else if (!auth.isLoading()) {
          <a
            routerLink="/login"
            class="inline-flex h-8 items-center rounded-md px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Sign In
          </a>
        }
      </div>
    </header>
  `,
})
export class NavbarComponent {
  protected readonly sidebarService = inject(VoltSidebarService);
  protected readonly auth = inject(DevAuth);
  protected readonly sections = SHELL_SECTIONS;
  protected readonly activeSection = injectActiveSection();
}
