import { Component, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
    selector: 'ui-slider',
    standalone: true,
    imports: [FormsModule],
    template: `
    <div class="space-y-3">
        <div class="flex justify-between items-center">
             <label class="block text-sm font-medium text-text">{{ label() }}</label>
             <ng-content select="[badge]"></ng-content>
        </div>
        <input 
            type="range" 
            [ngModel]="value()" 
            (ngModelChange)="onValueChange($event)"
            [min]="min()" 
            [max]="max()" 
            [step]="step()"
            class="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
        <div class="flex justify-between text-xs text-text-muted">
            <span>{{ minLabel() }}</span>
            <span>{{ maxLabel() }}</span>
        </div>
      </div>
  `
})
export class SliderComponent {
    label = input.required<string>();
    value = model.required<number>();
    min = input(0);
    max = input(100);
    step = input(1);
    minLabel = input('');
    maxLabel = input('');

    onValueChange(val: number) {
        this.value.set(val);
    }
}
