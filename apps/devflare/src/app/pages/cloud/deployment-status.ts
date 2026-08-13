import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { deploymentTone } from '@org/core';

/**
 * A deployment's stage status as a coloured pill.
 *
 * Not a `volt-badge`: the installed Volt badge exposes four brand variants and
 * no way to pass classes, and success/failure/in-progress need semantic colour.
 * Every class is written out in full so Tailwind's scanner finds it — none of
 * these are composed at runtime.
 */
@Component({
  selector: 'app-deployment-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      [class]="pillClass()"
    >
      <span class="w-1.5 h-1.5 rounded-full" [class]="dotClass()"></span>
      {{ label() }}
    </span>
  `,
})
export class DeploymentStatus {
  readonly status = input.required<string>();
  /** Shown instead of the raw status when the stage adds meaning ("build"). */
  readonly stage = input<string | null>(null);

  protected readonly label = computed(() => {
    const status = this.status();
    const stage = this.stage();
    return stage && stage !== 'deploy' && status !== 'success'
      ? `${stage}: ${status}`
      : status;
  });

  protected readonly pillClass = computed(() => {
    switch (deploymentTone(this.status())) {
      case 'success':
        return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400';
      case 'failure':
        return 'bg-red-500/10 text-red-700 dark:text-red-400';
      case 'progress':
        return 'bg-amber-500/10 text-amber-700 dark:text-amber-400';
      default:
        return 'bg-muted text-muted-foreground';
    }
  });

  protected readonly dotClass = computed(() => {
    switch (deploymentTone(this.status())) {
      case 'success':
        return 'bg-emerald-500';
      case 'failure':
        return 'bg-red-500';
      case 'progress':
        return 'bg-amber-500 animate-pulse';
      default:
        return 'bg-muted-foreground';
    }
  });
}
