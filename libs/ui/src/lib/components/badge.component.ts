import { Component, input } from '@angular/core';
import { NgClass } from '@angular/common';

type BadgeVariant = 'neutral' | 'success' | 'warning' | 'error' | 'indigo';

@Component({
  selector: 'ui-badge',
  standalone: true,
  imports: [NgClass],
  template: `
    <span 
      class="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset"
      [ngClass]="getClasses()"
    >
      <ng-content></ng-content>
    </span>
  `
})
export class BadgeComponent {
  variant = input<BadgeVariant>('neutral');

  getClasses(): string {
    const classes = {
      neutral: 'bg-secondary/50 text-text-muted ring-border',
      success: 'bg-success/10 text-success ring-success/20',
      warning: 'bg-warning/10 text-warning-foreground dark:text-warning ring-warning/20', // Warning foreground is white in light mode, might need adjustment or use text-warning everywhere if legible
      error: 'bg-destructive/10 text-destructive ring-destructive/10',
      indigo: 'bg-primary/10 text-primary ring-primary/10'
    };

    // Adjusting warning specific text color for better contrast if needed, or stick to semantic logic.
    // Let's refine based on the tokens I defined.
    // warning: amber-500. text-warning might be too light on light bg? 
    // Let's try to stick to standard pattern: bg-token/10 text-token ring-token/20

    const semanticClasses = {
      neutral: 'bg-secondary text-text-muted ring-border',
      success: 'bg-success/10 text-success ring-success/20',
      warning: 'bg-warning/10 text-yellow-700 dark:text-warning ring-warning/20', // Manual override for contrast if semantic token is too bright for text
      error: 'bg-destructive/10 text-destructive ring-destructive/10',
      indigo: 'bg-primary/10 text-primary ring-primary/10'
    };

    return semanticClasses[this.variant()];
  }
}
