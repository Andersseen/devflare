import { Component, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CardComponent } from '@ui-components/card.component';
import { ButtonComponent } from '@ui-components/button.component';
import { SliderComponent } from '@ui-components/slider.component';

export interface ProcessingConfig {
  quality: number; // 0-100
  format: 'image/jpeg' | 'image/png' | 'image/webp';
  maxWidth: number;
}

@Component({
  selector: 'app-control-panel',
  standalone: true,
  imports: [FormsModule, CardComponent, ButtonComponent, SliderComponent],
  template: `
    <ui-card>
      <div class="space-y-8 h-full">
        <div>
          <h3 class="text-sm font-semibold text-text uppercase tracking-wider mb-4">Settings</h3>
          
          <!-- Format Selection -->
          <div class="space-y-3">
            <label class="block text-sm font-medium text-text-muted">Target Format</label>
            <div class="grid grid-cols-3 gap-2">
              @for (fmt of formats; track fmt.value) {
                <ui-button 
                    [variant]="currentFormat() === fmt.value ? 'primary' : 'secondary'"
                    size="sm"
                    class="w-full"
                    [block]="true"
                    (click)="setFormat(fmt.value)"
                >
                    {{ fmt.label }}
                </ui-button>
              }
            </div>
          </div>
        </div>

        <!-- Quality Slider -->
        <ui-slider
            label="Quality"
            [(value)]="quality"
            [min]="1" 
            [max]="100"
            minLabel="Low Size"
            maxLabel="Best Quality"
            (valueChange)="emitChange()"
        >
             <span badge class="inline-flex items-center rounded-md bg-secondary/50 px-2 py-1 text-xs font-medium text-text-muted ring-1 ring-inset ring-border">
               {{ quality() }}%
             </span>
        </ui-slider>

         <!-- Resize (Optional) -->
         <div class="space-y-3">
           <label class="block text-sm font-medium text-text-muted">Max Width (px)</label>
           <div class="relative rounded-md shadow-sm">
              <input 
                type="number"
                [ngModel]="maxWidth()"
                (ngModelChange)="updateMaxWidth($event)"
                placeholder="Auto"
                class="block w-full rounded-md border-0 py-1.5 pl-3 pr-12 text-text shadow-sm ring-1 ring-inset ring-border placeholder:text-text-muted focus:ring-2 focus:ring-inset focus:ring-primary sm:text-sm sm:leading-6 bg-transparent"
               >
               <div class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                 <span class="text-text-muted sm:text-sm">px</span>
               </div>
           </div>
           <p class="text-xs text-text-muted">Leave empty or 0 to keep original width.</p>
         </div>
      </div>
    </ui-card>
  `
})
export class ControlPanelComponent {
  configChanged = output<ProcessingConfig>();

  quality = signal(80);
  currentFormat = signal<'image/jpeg' | 'image/png' | 'image/webp'>('image/jpeg');
  maxWidth = signal<number>(0);

  formats = [
    { label: 'JPG', value: 'image/jpeg' },
    { label: 'PNG', value: 'image/png' },
    { label: 'WEBP', value: 'image/webp' }
  ] as const;

  setFormat(format: any) {
    this.currentFormat.set(format);
    this.emitChange();
  }

  updateMaxWidth(val: number) {
    this.maxWidth.set(val);
    this.emitChange();
  }

  emitChange() {
    setTimeout(() => {
      this.configChanged.emit({
        quality: this.quality(),
        format: this.currentFormat(),
        maxWidth: this.maxWidth()
      });
    }, 0);
  }
}
