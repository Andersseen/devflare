import { Component, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { VoltSidebarService } from '@voltui/components';
import { DevAuth } from '@dev-auth/angular';
import {
  DEVTOOLS_LINK,
  injectActiveSection,
  SHELL_SECTIONS,
} from './shell-navigation';

@Component({
  selector: 'app-navbar',
  imports: [RouterLink, LucideAngularModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
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
        <!-- The one product-level link to the separate DevTools app. Its
             individual tools are deliberately not listed anywhere in DevFlare. -->
        @if (devtoolsLink) {
          <a
            [href]="devtoolsLink"
            target="_blank"
            rel="noreferrer"
            class="hidden h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:inline-flex"
          >
            DevTools
            <lucide-icon name="external-link" class="h-3.5 w-3.5" />
          </a>
        }
        <dev-auth-user-button
          [style.--dev-auth-surface]="'var(--popover)'"
          [style.--dev-auth-foreground]="'var(--popover-foreground)'"
          [style.--dev-auth-muted]="'var(--muted-foreground)'"
          [style.--dev-auth-border]="'var(--border)'"
          [style.--dev-auth-focus]="'var(--ring)'"
        >
          <a slot="menu-actions" role="menuitem" routerLink="/settings">
            Settings
          </a>
        </dev-auth-user-button>
        @if (!auth.isLoading() && !auth.isAuthenticated()) {
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
  protected readonly devtoolsLink = DEVTOOLS_LINK;
}
