import { Component, inject } from '@angular/core';
import { Auth } from '@org/auth';
import { ToolGridComponent } from '../components/tool-grid.component';
import { PLATFORM_CARDS, TOOLS } from '../components/shell-navigation';

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
          Developer Tools, Reimagined.
        </h1>
        <p class="mx-auto max-w-2xl text-xl text-muted-foreground">
          A suite of powerful, client-side tools to help you build, optimize,
          and deploy faster. No server required.
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
  protected readonly cards = [...PLATFORM_CARDS, ...TOOLS];
}
