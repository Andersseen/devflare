import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
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
import { AuthService } from '@org/auth';

@Component({
  selector: 'app-sidebar',
  imports: [
    RouterLink,
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
      <!-- Header / Logo -->
      <volt-sidebar-header>
        <a routerLink="/" class="flex items-center gap-2 overflow-hidden">
          <div class="w-8 h-8 shrink-0 bg-primary rounded-lg flex items-center justify-center">
            <span class="text-primary-foreground font-bold text-sm">D</span>
          </div>
          @if (!sidebarService.isCollapsed()) {
            <span class="text-xl font-bold truncate">DevFlare</span>
          }
        </a>
      </volt-sidebar-header>

      <!-- Nav -->
      <volt-sidebar-content>
        <volt-sidebar-group label="Platform">
          <volt-sidebar-item routerLink="/" label="Dashboard" [exact]="true">
            <lucide-icon slot="icon" name="layout-dashboard" class="w-5 h-5" />
          </volt-sidebar-item>

          <volt-sidebar-item routerLink="/deploy" label="Deploy">
            <lucide-icon slot="icon" name="zap" class="w-5 h-5" />
          </volt-sidebar-item>

          <volt-sidebar-item routerLink="/projects" label="Projects">
            <lucide-icon slot="icon" name="folder-open" class="w-5 h-5" />
          </volt-sidebar-item>
        </volt-sidebar-group>

        <volt-sidebar-group label="Tools">
          <volt-sidebar-item routerLink="/tools/image-compressor" label="Image Compressor">
            <lucide-icon slot="icon" name="image" class="w-5 h-5" />
          </volt-sidebar-item>

          <volt-sidebar-item routerLink="/tools/qr-generator" label="QR Generator">
            <lucide-icon slot="icon" name="qr-code" class="w-5 h-5" />
          </volt-sidebar-item>

          <volt-sidebar-item routerLink="/tools/svg-optimizer" label="SVG Optimizer">
            <lucide-icon slot="icon" name="scissors" class="w-5 h-5" />
          </volt-sidebar-item>

          <volt-sidebar-item routerLink="/tools/seo-simulator" label="SEO Simulator">
            <lucide-icon slot="icon" name="search" class="w-5 h-5" />
          </volt-sidebar-item>

          <volt-sidebar-item routerLink="/tools/converter" label="Data Converter">
            <lucide-icon slot="icon" name="arrow-right-left" class="w-5 h-5" />
          </volt-sidebar-item>

          <volt-sidebar-item routerLink="/tools/recorder" label="Screen Recorder">
            <lucide-icon slot="icon" name="video" class="w-5 h-5" />
          </volt-sidebar-item>

          <volt-sidebar-item routerLink="/tools/og-generator" label="Social Card Designer">
            <lucide-icon slot="icon" name="globe" class="w-5 h-5" />
          </volt-sidebar-item>

          <volt-sidebar-item routerLink="/tools/palette" label="Cinematic Palette">
            <lucide-icon slot="icon" name="brush" class="w-5 h-5" />
          </volt-sidebar-item>

          <volt-sidebar-item routerLink="/tools/bg-remover" label="Background Remover">
            <lucide-icon slot="icon" name="paint-bucket" class="w-5 h-5" />
          </volt-sidebar-item>

          <volt-sidebar-item routerLink="/tools/shortener" label="URL Shortener">
            <lucide-icon slot="icon" name="link" class="w-5 h-5" />
          </volt-sidebar-item>
        </volt-sidebar-group>

        <volt-sidebar-group label="Account">
          <volt-sidebar-item routerLink="/settings" label="Settings">
            <lucide-icon slot="icon" name="settings" class="w-5 h-5" />
          </volt-sidebar-item>
        </volt-sidebar-group>
      </volt-sidebar-content>

      <!-- Footer: user + collapse toggle -->
      <volt-sidebar-footer>
        @if (auth.isAuthenticated()) {
          <div class="px-3 py-2 mb-2">
            <div class="flex items-center gap-2 text-sm text-muted-foreground">
              <lucide-icon name="user" class="w-4 h-4 shrink-0" />
              @if (!sidebarService.isCollapsed()) {
                <span class="truncate">{{ auth.user()?.name || auth.user()?.email }}</span>
              }
            </div>
          </div>
          <button
            (click)="logout()"
            class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground mb-2"
          >
            <lucide-icon name="log-out" class="w-4 h-4 shrink-0" />
            @if (!sidebarService.isCollapsed()) {
              <span>Logout</span>
            }
          </button>
        }
        <button
          (click)="sidebarService.toggleCollapse()"
          class="hidden md:flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          @if (sidebarService.isCollapsed()) {
            <lucide-icon name="panel-left-open" class="w-5 h-5" />
          } @else {
            <lucide-icon name="panel-left-close" class="w-5 h-5" />
            <span class="text-sm">Collapse</span>
          }
        </button>
      </volt-sidebar-footer>
    </volt-sidebar>
  `,
})
export class SidebarComponent {
  protected readonly sidebarService = inject(VoltSidebarService);
  protected readonly auth = inject(AuthService);

  logout() {
    this.auth.logout();
  }
}
