import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

/**
 * The three non-content states every data page shares: loading, error and
 * empty. Content is projected only by the page, once data is ready.
 */
@Component({
  selector: 'app-page-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  template: `
    @switch (kind()) {
      @case ('loading') {
        <div class="space-y-3" role="status" aria-live="polite">
          <span class="sr-only">Loading…</span>
          @for (row of rows; track row) {
            <div class="h-14 animate-pulse rounded-lg bg-muted/60"></div>
          }
        </div>
      }
      @case ('error') {
        <div
          class="flex flex-col items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-8 text-center"
          role="alert"
        >
          <lucide-icon name="triangle-alert" class="h-6 w-6 text-red-600" />
          <p class="font-medium">Could not load this page</p>
          <p class="max-w-md text-sm text-muted-foreground">{{ message() }}</p>
          <button
            type="button"
            class="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
            (click)="retry.emit()"
          >
            Try again
          </button>
        </div>
      }
      @case ('empty') {
        <div
          class="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-10 text-center"
        >
          <lucide-icon [name]="icon()" class="h-6 w-6 text-muted-foreground" />
          <p class="font-medium">{{ title() }}</p>
          <p class="max-w-md text-sm text-muted-foreground">
            <ng-content />
          </p>
        </div>
      }
    }
  `,
})
export class PageStateComponent {
  readonly kind = input.required<'loading' | 'error' | 'empty'>();
  readonly message = input('');
  readonly title = input('Nothing here yet');
  readonly icon = input('info');
  readonly retry = output<void>();

  protected readonly rows = [1, 2, 3];
}
