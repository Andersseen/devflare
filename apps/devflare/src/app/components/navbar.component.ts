import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { VoltAvatar, VoltAvatarFallback, VoltButton } from '@voltui/components';
import { VoltSidebarService } from '@voltui/components';
import { Auth } from '@org/auth';
import { injectActiveSection, SHELL_SECTIONS } from './shell-navigation';

@Component({
  selector: 'app-navbar',
  imports: [
    RouterLink,
    LucideAngularModule,
    VoltButton,
    VoltAvatar,
    VoltAvatarFallback,
  ],
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
        @if (auth.user(); as user) {
          <volt-avatar class="h-8 w-8 text-xs">
            @if (user.image) {
              <img
                [src]="user.image"
                class="h-full w-full object-cover"
                alt=""
              />
            } @else {
              <volt-avatar-fallback>{{ initial() }}</volt-avatar-fallback>
            }
          </volt-avatar>
          <span class="hidden text-sm text-muted-foreground md:inline">
            {{ user.name || user.email }}
          </span>
          <volt-button variant="ghost" size="icon" (click)="logout()">
            <lucide-icon name="log-out" class="h-4 w-4" />
            <span class="sr-only">Log out</span>
          </volt-button>
        } @else if (!auth.loading()) {
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
  protected readonly auth = inject(Auth);
  protected readonly sections = SHELL_SECTIONS;
  protected readonly activeSection = injectActiveSection();

  protected readonly initial = computed(() => {
    const user = this.auth.user();
    return (user?.name || user?.email || '?').charAt(0).toUpperCase();
  });

  protected logout(): void {
    this.auth.logout();
  }
}
