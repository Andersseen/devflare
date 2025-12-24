import { Component } from '@angular/core';
import { ButtonComponent } from '@ui-components/button.component';
import { CardComponent } from '@ui-components/card.component';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-deployment-dashboard',
  imports: [CardComponent, ButtonComponent, LucideAngularModule],
  template: `
    <div class="p-6 space-y-8 max-w-7xl mx-auto">
      <header class="flex justify-between items-center">
        <div>
          <h1 class="text-3xl font-bold text-text tracking-tight">Deployment Dashboard</h1>
          <p class="text-text-muted mt-1">Manage your applications and deployments.</p>
        </div>
        <ui-button>
          <div class="flex items-center gap-2">
            <lucide-icon name="plus" [size]="20"></lucide-icon>
            New Project
          </div>
        </ui-button>
      </header>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <ui-card
          class="bg-secondary/20 border-dashed border-2 flex items-center justify-center p-8 hover:bg-secondary/40 transition-colors cursor-pointer group min-h-[200px]"
        >
          <div class="text-center">
            <div
              class="w-12 h-12 rounded-full bg-secondary group-hover:bg-background mx-auto flex items-center justify-center mb-3 transition-colors"
            >
              <lucide-icon name="plus" [size]="24" class="text-text-muted"></lucide-icon>
            </div>
            <h3 class="font-medium text-text">Create New App</h3>
            <p class="text-sm text-text-muted">Deploy a new project from GitHub</p>
          </div>
        </ui-card>

        <!-- Placeholder for Apps -->
        <div
          class="col-span-1 md:col-span-2 p-8 text-center text-text-muted bg-secondary/10 rounded-xl border border-border"
        >
          <lucide-icon name="activity" [size]="48" class="mx-auto mb-4 opacity-50"></lucide-icon>
          <h3 class="text-lg font-medium text-text mb-1">No Active Deployments</h3>
          <p>You haven't deployed any applications yet.</p>
        </div>
      </div>
    </div>
  `,
})
export class DeploymentDashboardComponent {}
