import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'ui-drawer',
    standalone: true,
    imports: [CommonModule],
    template: `
    @if (isOpen) {
      <div class="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
        <!-- Backdrop -->
        <div 
          class="fixed inset-0 bg-black/50 transition-opacity" 
          (click)="close.emit()">
        </div>

        <!-- Panel -->
        <div class="relative flex-1 flex flex-col max-w-xs w-full bg-surface dark:bg-slate-900 shadow-xl transition-transform duration-300 transform translate-x-0">
          
          <div class="absolute top-0 right-0 -mr-12 pt-2">
            <button 
              type="button" 
              class="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
              (click)="close.emit()">
              <span class="sr-only">Close sidebar</span>
              <svg class="h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="flex-1 h-0 overflow-y-auto">
             <ng-content></ng-content>
          </div>
        </div>
        
        <div class="flex-shrink-0 w-14">
          <!-- Force sidebar to shrink to fit close icon -->
        </div>
      </div>
    }
  `
})
export class DrawerComponent {
    @Input() isOpen = false;
    @Output() close = new EventEmitter<void>();
}
