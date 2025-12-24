import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { DrawerComponent } from '@ui-components/drawer.component';
import { SidebarNavComponent } from '@ui-components/sidebar-nav.component';
import { SidebarComponent } from '@ui-components/sidebar.component';
import { AuthService } from '@core-services/auth.service';
import { NavbarComponent, NavSection } from '@ui-components/navbar.component';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-dashboard-layout',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    SidebarComponent,
    DrawerComponent,
    SidebarNavComponent,
    NavbarComponent,
    LucideAngularModule,
  ],
  template: `
    <div class="h-screen flex flex-col bg-background text-text font-sans overflow-hidden">
      <!-- Navbar -->
      <ui-navbar
        [currentUser]="currentUser()"
        [activeSection]="activeSection()"
        (sectionChange)="onSectionChange($event)"
        (menuClick)="mobileMenuOpen.set(true)"
        (logout)="logout()"
      >
      </ui-navbar>

      <div class="flex-1 flex overflow-hidden">
        <!-- Desktop Sidebar -->
        <ui-sidebar class="hidden md:flex flex-col">
          <div class="flex-1 overflow-y-auto custom-scrollbar">
            <ui-sidebar-nav [activeSection]="activeSection()"></ui-sidebar-nav>
          </div>

          <!-- Fixed Footer -->
          <div class="mt-auto p-4 border-t border-border shrink-0">
            <a
              routerLink="/settings"
              routerLinkActive="bg-accent text-accent-foreground"
              class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-secondary text-text-muted font-medium transition-colors cursor-pointer group/link whitespace-nowrap overflow-hidden mb-2"
            >
              <lucide-icon
                name="settings"
                [size]="20"
                class="min-w-[1.25rem] group-hover/link:text-primary"
              ></lucide-icon>
              <span class="group-[.collapsed]:hidden transition-all duration-300">Settings</span>
            </a>
            <p
              class="text-xs text-text-muted text-center group-[.collapsed]:opacity-0 transition-opacity"
            >
              DevFlare v1.4.1
            </p>
          </div>
        </ui-sidebar>

        <!-- Mobile Drawer -->
        <ui-drawer [isOpen]="mobileMenuOpen()" (close)="mobileMenuOpen.set(false)">
          <div class="flex flex-col h-full">
            <div class="flex-1 overflow-y-auto">
              <ui-sidebar-nav
                [activeSection]="activeSection()"
                (linkClick)="mobileMenuOpen.set(false)"
              ></ui-sidebar-nav>
            </div>
            <div class="p-4 border-t border-border/10 shrink-0">
              <a
                routerLink="/settings"
                (click)="mobileMenuOpen.set(false)"
                class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/10 text-white/70 font-medium transition-colors cursor-pointer mb-2"
              >
                <lucide-icon name="settings" [size]="20"></lucide-icon>
                <span>Settings</span>
              </a>
              <p class="text-xs text-white/50 text-center">DevFlare v1.4.1</p>
            </div>
          </div>
        </ui-drawer>

        <!-- Main Content -->
        <main class="flex-1 overflow-y-auto relative w-full bg-background custom-scrollbar">
          <router-outlet></router-outlet>
        </main>
      </div>
    </div>
  `,
})
export class DashboardLayoutComponent {
  authService = inject(AuthService);
  currentUser = this.authService.currentUser;
  mobileMenuOpen = signal(false);
  activeSection = signal<NavSection>('deployment');

  logout() {
    this.authService.logout();
  }

  onSectionChange(section: NavSection) {
    this.activeSection.set(section);
  }
}
