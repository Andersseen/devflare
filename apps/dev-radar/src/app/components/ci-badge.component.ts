import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { CI_STATE_LABEL, type CiState } from '../../shared/ci-state';

const STYLE: Record<CiState, { icon: string; classes: string }> = {
  success: {
    icon: 'circle-check',
    classes:
      'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  failure: {
    icon: 'circle-x',
    classes: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
  },
  pending: {
    icon: 'loader',
    classes:
      'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  none: {
    icon: 'circle-minus',
    classes: 'border-border bg-muted/40 text-muted-foreground',
  },
  unknown: {
    icon: 'circle-dashed',
    classes: 'border-border bg-muted/40 text-muted-foreground',
  },
};

/**
 * CI state as icon + text (never colour alone). "No CI" and "Unknown" are
 * deliberately neutral: a repository without workflows is not green.
 */
@Component({
  selector: 'app-ci-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  template: `
    <span
      class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
      [class]="style().classes"
      [attr.data-ci]="state()"
    >
      <lucide-icon [name]="style().icon" class="h-3 w-3" aria-hidden="true" />
      {{ label() }}
    </span>
  `,
})
export class CiBadgeComponent {
  readonly state = input.required<CiState>();
  protected readonly style = computed(() => STYLE[this.state()]);
  protected readonly label = computed(() => CI_STATE_LABEL[this.state()]);
}
