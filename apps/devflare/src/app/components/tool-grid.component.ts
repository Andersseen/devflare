import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import {
  VoltCard,
  VoltCardDescription,
  VoltCardHeader,
  VoltCardTitle,
} from '@voltui/components';
import type { Tool } from './shell-navigation';

@Component({
  selector: 'app-tool-grid',
  imports: [
    RouterLink,
    LucideAngularModule,
    VoltCard,
    VoltCardHeader,
    VoltCardTitle,
    VoltCardDescription,
  ],
  template: `
    <div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      @for (tool of tools(); track tool.link) {
        <a [routerLink]="tool.link" class="group block">
          <volt-card
            class="h-full transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg"
          >
            <volt-card-header class="gap-4">
              <div
                class="flex h-12 w-12 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110"
                [class]="tool.bgClass"
              >
                <lucide-icon
                  [name]="tool.icon"
                  class="h-6 w-6"
                  [class]="tool.colorClass"
                />
              </div>
              <div class="space-y-2">
                <volt-card-title
                  class="text-xl font-bold transition-colors group-hover:text-primary"
                >
                  {{ tool.title }}
                </volt-card-title>
                <volt-card-description>
                  {{ tool.description }}
                </volt-card-description>
              </div>
            </volt-card-header>
          </volt-card>
        </a>
      }
    </div>
  `,
})
export class ToolGridComponent {
  readonly tools = input.required<Tool[]>();
}
