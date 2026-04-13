import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  VoltSidebar,
  VoltSidebarHeader,
  VoltSidebarContent,
  VoltSidebarGroup,
  VoltSidebarItem,
  VoltSidebarFooter,
  VoltSidebarService,
} from '@voltui/components';

@Component({
  selector: 'app-sidebar',
  imports: [
    RouterLink,
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
            <svg slot="icon" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </volt-sidebar-item>

          <volt-sidebar-item routerLink="/deploy" label="Deploy">
            <svg slot="icon" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </volt-sidebar-item>

          <volt-sidebar-item routerLink="/projects" label="Projects">
            <svg slot="icon" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </volt-sidebar-item>
        </volt-sidebar-group>

        <volt-sidebar-group label="Tools">
          <volt-sidebar-item routerLink="/tools/image-compressor" label="Image Compressor">
            <svg slot="icon" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </volt-sidebar-item>

          <volt-sidebar-item routerLink="/tools/qr-generator" label="QR Generator">
            <svg slot="icon" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
          </volt-sidebar-item>
        </volt-sidebar-group>
      </volt-sidebar-content>

      <!-- Footer: collapse toggle -->
      <volt-sidebar-footer>
        <button
          (click)="sidebarService.toggleCollapse()"
          class="hidden md:flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          @if (sidebarService.isCollapsed()) {
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          } @else {
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
            <span class="text-sm">Collapse</span>
          }
        </button>
      </volt-sidebar-footer>
    </volt-sidebar>
  `,
})
export class SidebarComponent {
  protected readonly sidebarService = inject(VoltSidebarService);
}
