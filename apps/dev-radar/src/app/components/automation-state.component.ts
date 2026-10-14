import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import {
  AUTOMATION_STATE_LABEL,
  type AutomationState,
} from '../../shared/automation';

const STYLE: Record<AutomationState, { icon: string; classes: string }> = {
  disabled: {
    icon: 'circle-minus',
    classes: 'border-border bg-muted/40 text-muted-foreground',
  },
  waiting_update: {
    icon: 'clock',
    classes: 'border-border bg-muted/40 text-muted-foreground',
  },
  waiting_ci: {
    icon: 'loader',
    classes:
      'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  preparing: {
    icon: 'loader',
    classes: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  },
  ready: {
    icon: 'circle-check',
    classes:
      'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  blocked: {
    icon: 'triangle-alert',
    classes:
      'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  failed: {
    icon: 'circle-x',
    classes: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
  },
  skipped: {
    icon: 'circle-dashed',
    classes: 'border-border bg-muted/40 text-muted-foreground',
  },
};

/** The derived automation state as icon + text (never colour alone). */
@Component({
  selector: 'app-automation-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  template: `
    <span
      class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
      [class]="style().classes"
      [attr.data-automation-state]="state()"
    >
      <lucide-icon [name]="style().icon" class="h-3 w-3" aria-hidden="true" />
      {{ label() }}
    </span>
  `,
})
export class AutomationStateComponent {
  readonly state = input.required<AutomationState>();
  protected readonly style = computed(() => STYLE[this.state()]);
  protected readonly label = computed(
    () => AUTOMATION_STATE_LABEL[this.state()],
  );
}
