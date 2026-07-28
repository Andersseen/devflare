import { Component, inject } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import {
  VoltSidebar,
  VoltSidebarHeader,
  VoltSidebarContent,
  VoltSidebarGroup,
  VoltSidebarItem,
  VoltSidebarFooter,
  VoltSidebarService,
} from '@voltui/components';
import {
  APP_VERSION,
  injectActiveSection,
  SETTINGS_ITEM,
} from './shell-navigation';

@Component({
  selector: 'app-sidebar',
  imports: [
    LucideAngularModule,
    VoltSidebar,
    VoltSidebarHeader,
    VoltSidebarContent,
    VoltSidebarGroup,
    VoltSidebarItem,
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
        @for (group of activeSection().groups; track group.label) {
          <volt-sidebar-group [label]="group.label">
            @for (item of group.items; track item.link) {
              <volt-sidebar-item
                [routerLink]="item.link"
                [label]="item.label"
                [exact]="item.exact ?? false"
              >
                <lucide-icon
                  slot="icon"
                  [name]="item.icon"
                  class="h-5 w-5 shrink-0"
                />
              </volt-sidebar-item>
            }
          </volt-sidebar-group>
        }
      </volt-sidebar-content>

      <volt-sidebar-footer>
        <volt-sidebar-item
          [routerLink]="settingsItem.link"
          [label]="settingsItem.label"
        >
          <lucide-icon
            slot="icon"
            [name]="settingsItem.icon"
            class="h-5 w-5 shrink-0"
          />
        </volt-sidebar-item>

        @if (!sidebarService.isCollapsed()) {
          <p class="px-3 pt-3 text-xs text-muted-foreground">
            DevFlare v{{ version }}
          </p>
        }
      </volt-sidebar-footer>
    </volt-sidebar>
  `,
})
export class SidebarComponent {
  protected readonly sidebarService = inject(VoltSidebarService);
  protected readonly activeSection = injectActiveSection();
  protected readonly settingsItem = SETTINGS_ITEM;
  protected readonly version = APP_VERSION;
}
