import { Component, input, model } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'ui-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="w-full">
      @if (label()) {
        <label class="block text-sm font-medium text-foreground mb-1">
          {{ label() }}
        </label>
      }
      <input
        [type]="type()"
        [placeholder]="placeholder()"
        [disabled]="disabled()"
        [(ngModel)]="value"
        class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      />
      @if (error()) {
        <p class="mt-1 text-sm text-destructive">{{ error() }}</p>
      }
    </div>
  `,
})
export class InputComponent {
  label = input<string>('');
  type = input<string>('text');
  placeholder = input<string>('');
  disabled = input<boolean>(false);
  error = input<string>('');
  value = model<string>('');
}
