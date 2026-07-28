import { Component } from '@angular/core';
import { ToolGridComponent } from '../../components/tool-grid.component';
import { TOOLS } from '../../components/shell-navigation';

@Component({
  selector: 'app-tools-page',
  imports: [ToolGridComponent],
  template: `
    <div class="mx-auto max-w-7xl space-y-8">
      <div class="space-y-2">
        <h1 class="text-3xl font-bold tracking-tight">DevTools</h1>
        <p class="max-w-2xl text-muted-foreground">
          Everything runs in your browser — no uploads, no accounts, no server
          round-trips.
        </p>
      </div>

      <app-tool-grid [tools]="tools" />
    </div>
  `,
})
export default class ToolsPage {
  protected readonly tools = TOOLS;
}
