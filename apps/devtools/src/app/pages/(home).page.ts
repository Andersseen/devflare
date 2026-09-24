import { Component } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import {
  TOOL_CATEGORIES,
  toolsIn,
  toolsWithMode,
  type Tool,
} from '../tools/tool-registry';

@Component({
  selector: 'app-home-page',
  imports: [NgTemplateOutlet, RouterLink, LucideAngularModule],
  template: `
    <div class="space-y-14">
      <section class="max-w-2xl space-y-3">
        <h1 class="text-4xl font-bold tracking-tight">
          Small utilities, no strings attached.
        </h1>
        <p class="text-lg text-muted-foreground">
          A short, curated set of tools we actually use. Most run entirely in
          your browser — no uploads, no account. A few need a server, and say
          so.
        </p>
      </section>

      <section class="space-y-8" aria-labelledby="local">
        <div class="flex items-start gap-3">
          <lucide-icon name="shield-check" class="mt-1 h-5 w-5 text-primary" />
          <div>
            <h2 id="local" class="text-2xl font-semibold">Local</h2>
            <p class="text-sm text-muted-foreground">
              Runs entirely in your browser. What you paste — tokens, headers,
              configs, requests — never leaves the tab.
            </p>
          </div>
        </div>

        @for (category of localCategories; track category.id) {
          <section class="space-y-4" [attr.aria-labelledby]="category.id">
            <div>
              <h3 [id]="category.id" class="text-lg font-semibold">
                {{ category.label }}
              </h3>
              <p class="text-sm text-muted-foreground">
                {{ category.description }}
              </p>
            </div>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              @for (tool of category.tools; track tool.path) {
                <ng-container
                  *ngTemplateOutlet="card; context: { $implicit: tool }"
                />
              }
            </div>
          </section>
        }
      </section>

      <section
        class="space-y-4 rounded-xl border border-border bg-muted/20 p-6"
        aria-labelledby="connected"
      >
        <div class="flex items-start gap-3">
          <lucide-icon name="cloud" class="mt-1 h-5 w-5 text-primary" />
          <div>
            <h2 id="connected" class="text-2xl font-semibold">Connected</h2>
            <p class="text-sm text-muted-foreground">
              Tools that need persistent storage or a server to fetch from. Sign
              in with DevAuth to use them; access is limited to allowed
              accounts.
            </p>
          </div>
        </div>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          @for (tool of connected; track tool.path) {
            <ng-container
              *ngTemplateOutlet="card; context: { $implicit: tool }"
            />
          }
        </div>
      </section>
    </div>

    <ng-template #card let-tool>
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
            class="flex items-center gap-2 font-semibold transition-colors group-hover:text-primary"
          >
            {{ tool.title }}
            @if (tool.mode === 'connected') {
              <span
                class="rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                Sign-in
              </span>
            }
          </span>
          <span class="block text-sm text-muted-foreground">{{
            tool.description
          }}</span>
        </span>
      </a>
    </ng-template>
  `,
})
export default class HomePage {
  protected readonly localCategories = TOOL_CATEGORIES.map((category) => ({
    ...category,
    tools: toolsIn(category.id, 'local'),
  })).filter((category) => category.tools.length > 0);

  protected readonly connected: Tool[] = toolsWithMode('connected');
}
