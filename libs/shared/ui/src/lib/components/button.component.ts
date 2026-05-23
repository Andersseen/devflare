import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'ui-button',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button
      [type]="type()"
      [disabled]="disabled()"
      (click)="onClick.emit($event)"
      class="inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
      [class]="classes()"
    >
      <ng-content></ng-content>
    </button>
  `,
})
export class ButtonComponent {
  variant = input<ButtonVariant>('primary');
  size = input<ButtonSize>('md');
  type = input<'button' | 'submit' | 'reset'>('button');
  disabled = input<boolean>(false);
  fullWidth = input<boolean>(false);

  onClick = output<MouseEvent>();

  classes = () => {
    const baseClasses = {
      primary:
        'bg-primary text-primary-foreground hover:bg-primary/90 focus:ring-primary',
      secondary:
        'bg-secondary text-secondary-foreground hover:bg-secondary/80 focus:ring-secondary',
      danger:
        'bg-destructive text-destructive-foreground hover:bg-destructive/90 focus:ring-destructive',
      ghost: 'hover:bg-accent hover:text-accent-foreground focus:ring-accent',
    };

    const sizeClasses = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2 text-sm',
      lg: 'px-6 py-3 text-base',
    };

    return [
      baseClasses[this.variant()],
      sizeClasses[this.size()],
      this.fullWidth() ? 'w-full' : '',
    ].join(' ');
  };
}
