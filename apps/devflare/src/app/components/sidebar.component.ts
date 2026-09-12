import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import {
  VoltSidebar,
  VoltSidebarHeader,
  VoltSidebarContent,
  VoltSidebarFooter,
  VoltSidebarService,
} from '@voltui/components';
import {
  APP_VERSION,
  injectActiveSection,
  isExternalLink,
  SETTINGS_ITEM,
} from './shell-navigation';

@Component({
  selector: 'app-sidebar',
  imports: [
    LucideAngularModule,
    RouterLink,
    RouterLinkActive,
    VoltSidebar,
    VoltSidebarHeader,
    VoltSidebarContent,
    VoltSidebarFooter,
  ],
  template: `
    <volt-sidebar>
      <!-- The wordmark lives in the navbar; this row only carries the toggle. -->
      <volt-sidebar-header>
        <div
          class="flex w-full items-center"
          [class]="
            sidebarService.isCollapsed() ? 'justify-center' : 'justify-end'
          "
        >
          <button
            (click)="sidebarService.toggleCollapse()"
            class="hidden h-7 w-7 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:inline-flex"
            [attr.aria-label]="
              sidebarService.isCollapsed()
                ? 'Expand sidebar'
                : 'Collapse sidebar'
            "
          >
            <lucide-icon
              [name]="
                sidebarService.isCollapsed()
                  ? 'panel-left-open'
                  : 'panel-left-close'
              "
              class="h-4 w-4"
            />
          </button>

          <button
            (click)="sidebarService.setMobileOpen(false)"
            class="flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
            aria-label="Close sidebar"
          >
            <lucide-icon name="x" class="h-4 w-4" />
          </button>
        </div>
      </volt-sidebar-header>

      <volt-sidebar-content>
        <nav
          class="space-y-6 py-4"
          [class.px-3]="!sidebarService.isCollapsed()"
          aria-label="Section navigation"
        >
          @for (group of activeSection().groups; track group.label) {
            <section class="space-y-1">
              <div class="flex items-center gap-2 px-2 pb-1">
                <span class="h-px w-4 shrink-0 bg-border"></span>
                @if (!sidebarService.isCollapsed()) {
                  <span
                    class="text-[0.68rem] font-semibold uppercase text-muted-foreground/70"
                  >
                    {{ group.label }}
                  </span>
                  <span class="h-px flex-1 bg-border"></span>
                }
              </div>

              <div class="space-y-1">
                @for (item of group.items; track item.link) {
                  @if (isExternal(item.link)) {
                    <a
                      [href]="item.link"
                      target="_blank"
                      rel="noreferrer"
                      class="group flex h-11 items-center gap-3 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      [class.justify-center]="sidebarService.isCollapsed()"
                      [class.px-3]="!sidebarService.isCollapsed()"
                      [attr.aria-label]="
                        sidebarService.isCollapsed() ? item.label : null
                      "
                    >
                      <lucide-icon
                        [name]="item.icon"
                        class="h-5 w-5 shrink-0"
                      />
                      @if (!sidebarService.isCollapsed()) {
                        <span class="truncate">{{ item.label }}</span>
                      }
                    </a>
                  } @else {
                    <a
                      [routerLink]="item.link"
                      routerLinkActive="bg-primary/15 text-foreground ring-1 ring-primary/30"
                      [routerLinkActiveOptions]="{ exact: item.exact ?? false }"
                      class="group flex h-11 items-center gap-3 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      [class.justify-center]="sidebarService.isCollapsed()"
                      [class.px-3]="!sidebarService.isCollapsed()"
                      [attr.aria-label]="
                        sidebarService.isCollapsed() ? item.label : null
                      "
                    >
                      <lucide-icon
                        [name]="item.icon"
                        class="h-5 w-5 shrink-0"
                      />
                      @if (!sidebarService.isCollapsed()) {
                        <span class="truncate">{{ item.label }}</span>
                      }
                    </a>
                  }
                }
              </div>
            </section>
          }
        </nav>
      </volt-sidebar-content>

      <volt-sidebar-footer>
        <div
          class="border-t border-border py-4"
          [class.px-3]="!sidebarService.isCollapsed()"
        >
          <a
            [routerLink]="settingsItem.link"
            routerLinkActive="bg-primary/15 text-foreground ring-1 ring-primary/30"
            class="group flex h-11 items-center gap-3 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            [class.justify-center]="sidebarService.isCollapsed()"
            [class.px-3]="!sidebarService.isCollapsed()"
            [attr.aria-label]="
              sidebarService.isCollapsed() ? settingsItem.label : null
            "
          >
            <lucide-icon [name]="settingsItem.icon" class="h-5 w-5 shrink-0" />
            @if (!sidebarService.isCollapsed()) {
              <span class="truncate">{{ settingsItem.label }}</span>
            }
          </a>

          @if (!sidebarService.isCollapsed()) {
            <p class="px-3 pt-3 text-xs text-muted-foreground">
              DevFlare v{{ version }}
            </p>
          }
        </div>
      </volt-sidebar-footer>
    </volt-sidebar>
  `,
})
export class SidebarComponent {
  protected readonly sidebarService = inject(VoltSidebarService);
  protected readonly activeSection = injectActiveSection();
  protected readonly settingsItem = SETTINGS_ITEM;
  protected readonly version = APP_VERSION;
  protected readonly isExternal = isExternalLink;
}
