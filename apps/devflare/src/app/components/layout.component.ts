import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from './sidebar.component';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent],
  template: `
    <div class="flex min-h-screen bg-background">
      <app-sidebar />
      <main class="flex-1 p-8 overflow-auto">
        <router-outlet />
      </main>
    </div>
  `,
})
export class LayoutComponent {}
