import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { TOOL_CATEGORIES, toolsIn } from '../tools/tool-registry';

@Component({
  selector: 'app-home-page',
  imports: [RouterLink, LucideAngularModule],
  template: `
    <div class="space-y-12">
      <section class="max-w-2xl space-y-3">
        <h1 class="text-4xl font-bold tracking-tight">
          Small utilities, no strings attached.
        </h1>
        <p class="text-lg text-muted-foreground">
          Every tool runs entirely in your browser — no uploads, no accounts, no
          server round-trips. Open one and it keeps working offline.
        </p>
      </section>

      @for (category of categories; track category.id) {
        <section class="space-y-4" [attr.aria-labelledby]="category.id">
          <div>
            <h2 [id]="category.id" class="text-xl font-semibold">
              {{ category.label }}
            </h2>
            <p class="text-sm text-muted-foreground">
              {{ category.description }}
            </p>
          </div>

          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            @for (tool of toolsIn(category.id); track tool.path) {
              <a
                [routerLink]="['/', tool.path]"
                class="group flex items-start gap-4 rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
                  [class]="tool.bgClass"
                >
                  <lucide-icon
                    [name]="tool.icon"
                    class="h-5 w-5"
                    [class]="tool.colorClass"
                  />
                </span>
                <span class="min-w-0 space-y-1">
                  <span
                    class="block font-semibold transition-colors group-hover:text-primary"
                  >
                    {{ tool.title }}
                  </span>
                  <span class="block text-sm text-muted-foreground">
                    {{ tool.description }}
                  </span>
                </span>
              </a>
            }
          </div>
        </section>
      }
    </div>
  `,
})
export default class HomePage {
  protected readonly categories = TOOL_CATEGORIES;
  protected readonly toolsIn = toolsIn;
}
