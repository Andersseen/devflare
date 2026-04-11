import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

type BadgeVariant = 'default' | 'secondary' | 'success' | 'destructive' | 'outline';

@Component({
  selector: 'ui-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span
      class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors"
      [class]="variantClasses[variant()]"
    >
      <ng-content></ng-content>
    </span>
  `,
})
export class BadgeComponent {
  variant = input<BadgeVariant>('default');

  variantClasses: Record<BadgeVariant, string> = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/80',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
    success: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
    destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/80',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
  };
}
