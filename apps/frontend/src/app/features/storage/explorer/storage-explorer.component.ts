import { Component, computed, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ButtonComponent } from '@ui-components/button.component';
import { CardComponent } from '@ui-components/card.component';
import { StorageItem, StorageService } from '@core-services/storage.service';

@Component({
    selector: 'app-storage-explorer',
    standalone: true,
    imports: [DatePipe, CardComponent, ButtonComponent],
    template: `
    <div class="h-full flex flex-col p-4 md:p-8 gap-6">
       
       <!-- Toolbar / Breadcrumbs -->
       <div class="flex items-center justify-between">
           <div class="flex items-center gap-2 text-sm text-text-muted overflow-x-auto">
               <button (click)="navigateTo('')" class="hover:text-primary transition-colors font-medium">Home</button>
               @for (part of breadcrumbs(); track part.path) {
                   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-border">
                     <path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" />
                   </svg>
                   <button (click)="navigateTo(part.path)" class="hover:text-primary transition-colors font-medium whitespace-nowrap">
                       {{ part.name }}
                   </button>
               }
           </div>
           
           <div class="flex items-center gap-2">
               <ui-button variant="secondary" size="sm">
                   <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                   New Folder
               </ui-button>
               <ui-button variant="primary" size="sm">
                   <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                   Upload
               </ui-button>
           </div>
       </div>

       <!-- File List -->
       <ui-card class="flex-1 min-h-0 overflow-hidden flex flex-col">
           <div class="overflow-y-auto flex-1">
               <table class="w-full text-left border-collapse">
                   <thead>
                       <tr class="text-xs font-semibold text-text-muted border-b border-border">
                           <th class="p-4 pl-6 w-12">Type</th>
                           <th class="p-4">Name</th>
                           <th class="p-4 w-32">Size</th>
                           <th class="p-4 w-40">Modified</th>
                           <th class="p-4 w-12"></th>
                       </tr>
                   </thead>
                   <tbody class="text-sm">
                       @if (loading()) {
                           <tr>
                               <td colspan="5" class="p-12 text-center">
                                   <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                               </td>
                           </tr>
                       } @else if (items().length === 0) {
                           <tr>
                               <td colspan="5" class="p-12 text-center text-text-muted italic">
                                   This folder is empty.
                               </td>
                           </tr>
                       } @else {
                           @for (item of items(); track item.path) {
                               <tr 
                                   class="border-b border-border hover:bg-secondary/50 transition-colors cursor-pointer group"
                                   (click)="handleItemClick(item)"
                               >
                                   <td class="p-4 pl-6 text-text-muted">
                                       @if (item.type === 'folder') {
                                           <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6 text-primary/80">
                                              <path d="M19.5 21a3 3 0 003-3v-4.5a3 3 0 00-3-3h-15a3 3 0 00-3 3V18a3 3 0 003 3h15zM1.5 10.146V6a3 3 0 013-3h5.379a2.25 2.25 0 011.59.659l2.122 2.121c.14.141.331.22.53.22H19.5a3 3 0 013 3v1.146A4.483 4.483 0 0019.5 9h-15a4.483 4.483 0 00-3 1.146z" />
                                            </svg>
                                       } @else {
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6 text-text-muted">
                                              <path fill-rule="evenodd" d="M5.625 1.5H9a3.75 3.75 0 013.75 3.75v1.875c0 1.036.84 1.875 1.875 1.875H16.5a3.75 3.75 0 013.75 3.75v7.875c0 1.035-.84 1.875-1.875 1.875H5.625a1.875 1.875 0 01-1.875-1.875V3.375c0-1.036.84-1.875 1.875-1.875zM12.75 12a.75.75 0 00-1.5 0v2.25H9a.75.75 0 000 1.5h2.25V18a.75.75 0 001.5 0v-2.25H15a.75.75 0 000-1.5h-2.25V12z" clip-rule="evenodd" />
                                              <path d="M14.25 5.25a5.23 5.23 0 00-1.279-3.434 9.768 9.768 0 016.963 6.963A5.23 5.23 0 0016.5 7.5h-1.875a.375.375 0 01-.375-.375V5.25z" />
                                            </svg>
                                       }
                                   </td>
                                   <td class="p-4 font-medium text-text">
                                       {{ item.name }}
                                   </td>
                                   <td class="p-4 text-text-muted">
                                       {{ item.size ? formatSize(item.size) : '-' }}
                                   </td>
                                   <td class="p-4 text-text-muted">
                                       {{ item.lastModified | date:'MMM d, HH:mm' }}
                                   </td>
                                   <td class="p-4 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                                       <button class="p-1 hover:bg-secondary rounded text-text-muted">
                                           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                                              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
                                            </svg>
                                       </button>
                                   </td>
                               </tr>
                           }
                       }
                   </tbody>
               </table>
           </div>
       </ui-card>
    </div>
  `
})
export class StorageExplorerComponent {
    storageService = inject(StorageService);

    currentPath = signal('');
    loading = signal(false);
    items = signal<StorageItem[]>([]);

    breadcrumbs = computed(() => {
        const path = this.currentPath();
        if (!path) return [];

        const parts = path.split('/').filter(p => p);
        let accumulated = '';
        return parts.map(part => {
            accumulated += part + '/';
            return { name: part, path: accumulated };
        });
    });

    constructor() {
        effect(() => {
            this.loadItems(this.currentPath());
        });
    }

    loadItems(path: string) {
        this.loading.set(true);
        this.storageService.listFiles(path).subscribe(data => {
            this.items.set(data);
            this.loading.set(false);
        });
    }

    navigateTo(path: string) {
        this.currentPath.set(path);
    }

    handleItemClick(item: StorageItem) {
        if (item.type === 'folder') {
            this.navigateTo(item.path);
        } else {
            console.log('File details', item); // Open side panel in future
        }
    }

    formatSize(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const s = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + s[i];
    }
}
