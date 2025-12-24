import { Component } from '@angular/core';

@Component({
  selector: 'ui-card',
  standalone: true,
  template: `
    <div class="bg-surface border border-border rounded-xl shadow-sm p-4 md:p-6 transition-all duration-200">
      <ng-content></ng-content>
    </div>
  `
})
export class CardComponent { }
