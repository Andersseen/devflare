import { Component, inject } from '@angular/core';
import { Auth } from '@org/auth';
import { ToolGridComponent } from '../components/tool-grid.component';
import { PLATFORM_CARDS } from '../components/shell-navigation';

@Component({
  selector: 'app-home-page',
  imports: [ToolGridComponent],
  template: `
    <div class="mx-auto max-w-7xl space-y-10">
      <!-- Hero -->
      <div class="space-y-4 py-4 text-center">
        <h1
          class="bg-linear-to-r from-primary to-indigo-500 bg-clip-text pb-2 text-4xl font-extrabold tracking-tight text-transparent md:text-5xl"
        >
          Everything you ship, in one place.
        </h1>
        <p class="mx-auto max-w-2xl text-xl text-muted-foreground">
          Deploy a built folder, keep track of your projects, and see what is
          actually running on your Cloudflare account.
        </p>
        @if (auth.user(); as user) {
          <p class="text-sm text-muted-foreground">
            Welcome back,
            <span class="font-medium text-foreground">{{
              user.name || user.email
            }}</span>
          </p>
        }
      </div>

      <app-tool-grid [tools]="cards" />
    </div>
  `,
})
export default class HomePage {
  protected readonly auth = inject(Auth);

  /**
   * Deployment cards only. The tools used to be listed here as well, which put
   * the entire DevTools section on the Deployment section's own dashboard —
   * they already have their own landing page at /tools, reached from the
   * DevTools tab.
   */
  protected readonly cards = PLATFORM_CARDS;
}
