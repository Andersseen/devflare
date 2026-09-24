import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
} from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { filter, map } from 'rxjs';
import { TOOL_CATEGORIES, TOOLS, toolForUrl } from '../tools/tool-registry';

/**
 * DevTools' own chrome: a slim header and, on a tool page, a strip of every
 * other tool. No sign-in UI here on purpose — auth appears only inside the
 * connected tools, so browsing local tools is never interrupted. Deliberately not DevFlare's navbar + resizable sidebar — this is
 * a separate product with a flat list of utilities, not a control plane.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, LucideAngularModule],
  template: `
    <div class="flex min-h-screen flex-col bg-background">
      <header
        class="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur"
      >
        <div
          class="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6"
        >
          <a
            routerLink="/"
            class="flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span
              class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary font-mono text-sm font-bold text-primary-foreground"
              aria-hidden="true"
            >
              &lt;/&gt;
            </span>
            <span class="text-lg font-bold tracking-tight">DevTools</span>
          </a>

          <span
            class="ml-auto hidden items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground sm:inline-flex"
          >
            @if (activeTool()?.mode === 'connected') {
              <lucide-icon name="cloud" class="h-3.5 w-3.5 text-primary" />
              Connected tool · sign-in required
            } @else {
              <lucide-icon
                name="shield-check"
                class="h-3.5 w-3.5 text-primary"
              />
              Local tools run in your browser · no account
            }
          </span>
        </div>

        @if (activeTool()) {
          <nav
            class="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2 sm:px-6"
            aria-label="Tools"
          >
            @for (item of tools; track item.path) {
              <a
                [routerLink]="['/', item.path]"
                routerLinkActive="bg-primary/10 text-primary"
                ariaCurrentWhenActive="page"
                class="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <lucide-icon [name]="item.icon" class="h-4 w-4" />
                {{ item.navLabel ?? item.title }}
              </a>
            }
          </nav>
        }
      </header>

      <main class="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        @if (activeTool(); as tool) {
          <nav
            class="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground"
            aria-label="Breadcrumb"
          >
            <a routerLink="/" class="hover:text-primary">All tools</a>
            <span aria-hidden="true">/</span>
            <span>{{ categoryLabel(tool.category) }}</span>
            @if (tool.mode === 'connected') {
              <span aria-hidden="true">/</span>
              <span>Connected</span>
            }
          </nav>
        }
        <ng-content />
      </main>

      <footer class="border-t border-border">
        <div
          class="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:justify-between sm:px-6"
        >
          <p>
            Local tools keep what you paste in this tab — nothing is uploaded.
            Connected tools are marked and use DevTools' own server.
          </p>
          <p>Part of the DevFlare ecosystem.</p>
        </div>
      </footer>
    </div>
  `,
})
export class ShellComponent {
  readonly #router = inject(Router);

  protected readonly tools = TOOLS;

  readonly #url = toSignal(
    this.#router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.#router.url },
  );

  protected readonly activeTool = computed(() => toolForUrl(this.#url()));

  protected categoryLabel(id: string): string {
    return TOOL_CATEGORIES.find((category) => category.id === id)?.label ?? id;
  }
}
