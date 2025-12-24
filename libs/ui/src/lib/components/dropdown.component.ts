import { Component, signal, ElementRef, HostListener } from '@angular/core';

@Component({
  selector: 'ui-dropdown',
  standalone: true,
  template: `
    <div class="relative">
      <div (click)="toggle()" class="cursor-pointer">
        <ng-content select="[trigger]"></ng-content>
      </div>

      @if (isOpen()) {
        <div 
            class="absolute right-0 mt-2 w-48 origin-top-right rounded-md bg-surface shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50 animate-in fade-in zoom-in-95 duration-100 border border-border"
            role="menu"
        >
          <div class="py-1" role="none">
             <ng-content select="[menu]"></ng-content>
          </div>
        </div>
      }
    </div>
  `
})
export class DropdownComponent {
  isOpen = signal(false);

  constructor(private elementRef: ElementRef) { }

  toggle() {
    this.isOpen.update(v => !v);
  }

  close() {
    this.isOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.close();
    }
  }
}
