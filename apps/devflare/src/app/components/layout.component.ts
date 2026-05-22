import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { VoltSidebarService } from '@voltui/components';
import { SidebarComponent } from './sidebar.component';

@Component({
  selector: 'app-layout',
  imports: [RouterOutlet, SidebarComponent, LucideAngularModule],
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
            <lucide-icon name="menu" class="w-5 h-5" />
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
