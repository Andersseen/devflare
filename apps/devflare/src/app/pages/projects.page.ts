import { Component } from '@angular/core';
import { CardComponent, ButtonComponent } from '@org/ui';

@Component({
  selector: 'app-projects-page',
  standalone: true,
  imports: [CardComponent, ButtonComponent],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-3xl font-bold tracking-tight">Projects</h1>
          <p class="text-muted-foreground mt-1">Manage your deployed projects</p>
        </div>
        <ui-button routerLink="/deploy">New Project</ui-button>
      </div>

      <ui-card>
        <div class="text-center py-12">
          <div class="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <svg class="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h3 class="text-lg font-medium">No projects yet</h3>
          <p class="text-muted-foreground mt-1">Deploy your first project to get started</p>
          <ui-button routerLink="/deploy" class="mt-4">Deploy Project</ui-button>
        </div>
      </ui-card>
    </div>
  `,
})
export default class ProjectsPageComponent {}
