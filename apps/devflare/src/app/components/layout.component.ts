import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from './navbar.component';
import { SidebarComponent } from './sidebar.component';

@Component({
  selector: 'app-layout',
  imports: [RouterOutlet, NavbarComponent, SidebarComponent],
  template: `
    <!--
      App shell: the navbar and sidebar stay put, only <main> scrolls.
      h-screen + min-h-0 is what keeps the sidebar footer pinned to the bottom.
    -->
    <div class="flex h-screen flex-col overflow-hidden bg-background">
      <app-navbar />

      <div class="flex min-h-0 flex-1">
        <app-sidebar />

        <main class="min-w-0 flex-1 overflow-y-auto p-6 md:p-8">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class LayoutComponent {}
