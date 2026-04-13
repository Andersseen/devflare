import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { VoltSidebarService } from '@voltui/components';
import { SidebarComponent } from './sidebar.component';

@Component({
  selector: 'app-layout',
  imports: [RouterOutlet, SidebarComponent],
  template: `
    <div class="flex min-h-screen bg-background">
      <app-sidebar />

      <div class="flex flex-1 flex-col min-w-0">
        <!-- Mobile topbar -->
        <header class="flex h-14 items-center gap-4 border-b border-border px-4 md:hidden">
          <button
            (click)="sidebarService.toggleMobile()"
            class="flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Open sidebar"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span class="font-semibold">DevFlare</span>
        </header>

        <main class="flex-1 p-6 md:p-8 overflow-auto">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class LayoutComponent {
  protected readonly sidebarService = inject(VoltSidebarService);
}
