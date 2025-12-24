import { Component, input, output } from '@angular/core';
import { NgClass } from '@angular/common';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type ButtonSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'ui-button',
  standalone: true,
  imports: [NgClass],
  template: `
    <button
      [type]="type()"
      [disabled]="disabled()"
      (click)="onClick($event)"
      class="inline-flex items-center justify-center font-medium transition-all duration-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
      [class.w-full]="block()"
      [ngClass]="getClasses()"
    >
      <ng-content></ng-content>
    </button>
  `,
})
export class ButtonComponent {
  variant = input<ButtonVariant>('primary');
  size = input<ButtonSize>('md');
  type = input<'button' | 'submit' | 'reset'>('button');
  disabled = input(false);
  block = input(false);

  click = output<MouseEvent>();

  onClick(event: MouseEvent) {
    if (!this.disabled()) {
      this.click.emit(event);
    }
  }

  getClasses(): string {
    const baseClasses = {
      primary: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm',
      secondary: 'bg-surface text-text border border-border hover:bg-secondary shadow-sm',
      outline: 'border border-primary text-primary hover:bg-primary/10',
      ghost: 'hover:bg-accent hover:text-accent-foreground text-text-muted',
      danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm',
    };

    const sizeClasses = {
      sm: 'px-3 py-1.5 text-xs gap-1.5',
      md: 'px-4 py-2 text-sm gap-2',
      lg: 'px-6 py-3 text-base gap-2.5',
    };

    return `${baseClasses[this.variant()]} ${sizeClasses[this.size()]}`;
  }
}
