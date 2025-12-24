import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface TabItem {
  label: string;
  value: string;
}

@Component({
  selector: 'ui-tabs',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex items-center bg-secondary/50 rounded-lg p-1 border border-border">
      @for (item of items; track item.value) {
        <button 
            (click)="select(item.value)"
            class="px-3 py-1.5 text-sm font-medium rounded-md transition-all whitespace-nowrap"
            [class.bg-white]="activeValue === item.value"
            [class.dark:bg-slate-700]="activeValue === item.value"
            [class.shadow-sm]="activeValue === item.value"
            [class.text-text]="activeValue === item.value"
            [class.text-text-muted]="activeValue !== item.value"
            [class.hover:text-text]="activeValue !== item.value">
            {{ item.label }}
        </button>
      }
    </div>
  `
})
export class TabsComponent {
  @Input() items: TabItem[] = [];
  @Input() activeValue: string = '';
  @Output() change = new EventEmitter<string>();

  select(value: string) {
    if (this.activeValue !== value) {
      this.change.emit(value);
    }
  }
}
