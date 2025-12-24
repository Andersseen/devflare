import { Component, signal } from '@angular/core';

@Component({
  selector: 'ui-sidebar',
  standalone: true,
  template: `
    <aside 
      class="bg-surface border-r border-border flex flex-col shrink-0 z-10 transition-all duration-300 relative h-full group"
      [class.w-64]="!collapsed()"
      [class.w-20]="collapsed()"
      [class.collapsed]="collapsed()"
    >
       <!-- Toggle Button -->
       <button 
         (click)="toggle()"
         class="absolute -right-3 top-6 bg-surface border border-border rounded-full p-1 text-text-muted hover:text-primary shadow-sm z-20 cursor-pointer"
       >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 transition-transform duration-300" [class.rotate-180]="collapsed()">
            <path fill-rule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clip-rule="evenodd" />
          </svg>
       </button>

       <!-- Content -->
       <div class="flex-1 flex flex-col overflow-y-auto overflow-x-hidden">
         <ng-content></ng-content>
       </div>
    </aside>
  `
})
export class SidebarComponent {
  collapsed = signal(false);

  toggle() {
    this.collapsed.update(v => !v);
  }
}
