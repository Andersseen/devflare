import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'ui-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="rounded-xl border bg-card text-card-foreground shadow-sm"
      [class]="padding()"
    >
      @if (title()) {
        <div class="flex flex-col space-y-1.5 mb-4">
          <h3 class="text-2xl font-semibold leading-none tracking-tight">
            {{ title() }}
          </h3>
          @if (description()) {
            <p class="text-sm text-muted-foreground">{{ description() }}</p>
          }
        </div>
      }
      <ng-content></ng-content>
    </div>
  `,
})
export class CardComponent {
  title = input<string>('');
  description = input<string>('');
  padding = input<string>('p-6');
}
