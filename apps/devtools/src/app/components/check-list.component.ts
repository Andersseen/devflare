import { Component, input } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

export interface CheckItem {
  id: string;
  level: 'ok' | 'info' | 'warning' | 'error';
  message: string;
}

const ICON = {
  ok: 'circle-check',
  info: 'info',
  warning: 'triangle-alert',
  error: 'circle-x',
} as const;
const TONE = {
  ok: 'text-green-600',
  info: 'text-muted-foreground',
  warning: 'text-amber-600',
  error: 'text-red-600',
} as const;
const LABEL = {
  ok: 'OK',
  info: 'Note',
  warning: 'Warning',
  error: 'Problem',
} as const;

@Component({
  selector: 'app-check-list',
  imports: [LucideAngularModule],
  template: `
    <ul class="space-y-2">
      @for (check of checks(); track check.id) {
        <li class="flex gap-2 text-sm">
          <lucide-icon
            [name]="icon[check.level]"
            class="mt-0.5 h-4 w-4 shrink-0"
            [class]="tone[check.level]"
          />
          <span
            ><span class="sr-only">{{ label[check.level] }}: </span
            >{{ check.message }}</span
          >
        </li>
      }
    </ul>
  `,
})
export class CheckListComponent {
  readonly checks = input.required<CheckItem[]>();
  protected readonly icon = ICON;
  protected readonly tone = TONE;
  protected readonly label = LABEL;
}
