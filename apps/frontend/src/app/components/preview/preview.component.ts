import { Component, computed, effect, input, OnDestroy, signal } from '@angular/core';
import { BadgeComponent } from '@ui-components/badge.component';
import { ButtonComponent } from '@ui-components/button.component';

@Component({
    selector: 'app-preview',
    standalone: true,
    imports: [ButtonComponent, BadgeComponent],
    template: `
    <div class="h-full flex flex-col gap-6">
      
      <!-- Stats Header -->
      <div class="grid grid-cols-2 gap-4">
         <div class="bg-surface p-4 rounded-xl border border-border shadow-sm transition-all duration-300">
             <p class="text-xs text-text-muted uppercase tracking-wide font-semibold">Original</p>
             <p class="text-xl font-bold text-text mt-1">{{ formatSize(originalSize()) }}</p>
         </div>
         
         @if (compressedFile(); as compressed) {
             <div class="bg-primary/5 dark:bg-primary/10 p-4 rounded-xl border border-primary/20 shadow-sm relative overflow-hidden transition-all duration-300">
                 <p class="text-xs text-primary uppercase tracking-wide font-semibold">Optimized</p>
                 <div class="flex items-end gap-2 mt-1">
                     <p class="text-xl font-bold text-primary">{{ formatSize(compressedSize()) }}</p>
                     <ui-badge variant="success">
                        -{{ savedPercentage() }}%
                     </ui-badge>
                 </div>
             </div>
         } @else {
             <div class="bg-background p-4 rounded-xl border border-dashed border-border flex items-center justify-center">
                 <p class="text-sm text-text-muted italic">Waiting for optimization...</p>
             </div>
         }
      </div>

      <!-- Image Comparison / Preview -->
      <div class="flex-1 min-h-0 bg-secondary/50 rounded-xl border border-border relative overflow-hidden flex items-center justify-center p-4">
          @if (previewSrc()) {
            <img 
              [src]="previewSrc()" 
              class="max-h-full max-w-full object-contain shadow-lg rounded-lg transition-all duration-300 ease-out"
              [class.opacity-50]="!compressedFile() && originalFile()" 
              alt="Preview"
            >
          } @else {
            <div class="text-center text-text-muted flex flex-col items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-10 h-10 opacity-20">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                <p>No image to preview</p>
            </div>
          }
          
          <!-- Loading State Overlay -->
          @if (isLoading()) {
             <div class="absolute inset-0 bg-surface/50 backdrop-blur-sm flex items-center justify-center z-10">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
             </div>
          }
      </div>
    
      <!-- Actions -->
      <div class="flex justify-between items-center h-12">
          @if (compressedFile()) {
            <ui-button 
               (click)="download()"
               class="ml-auto"
            >
              <div class="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
                    <path fill-rule="evenodd" d="M12 2.25a.75.75 0 01.75.75v11.69l3.22-3.22a.75.75 0 111.06 1.06l-4.5 4.5a.75.75 0 01-1.06 0l-4.5-4.5a.75.75 0 111.06-1.06l3.22 3.22V3a.75.75 0 01.75-.75zm-9 13.5a.75.75 0 01.75.75v2.25a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5V16.5a.75.75 0 011.5 0v2.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V16.5a.75.75 0 01.75-.75z" clip-rule="evenodd" />
                  </svg>
                  Download
              </div>
            </ui-button>
          }
      </div>

    </div>
  `
})
export class PreviewComponent implements OnDestroy {
    originalFile = input<File | null>(null);
    compressedFile = input<File | null>(null);
    isLoading = input<boolean>(false);

    originalSize = computed(() => this.originalFile()?.size ?? 0);
    compressedSize = computed(() => this.compressedFile()?.size ?? 0);

    savedPercentage = computed(() => {
        const orig = this.originalSize();
        const comp = this.compressedSize();
        if (!orig || !comp) return 0;
        const pct = Math.round((1 - comp / orig) * 100);
        return pct < 0 ? 0 : pct;
    });

    previewSrc = signal<string | null>(null);

    constructor() {
        effect((onCleanup) => {
            const file = this.compressedFile() || this.originalFile();

            if (file) {
                const newUrl = URL.createObjectURL(file);
                this.previewSrc.set(newUrl);

                onCleanup(() => {
                    URL.revokeObjectURL(newUrl);
                });
            } else {
                this.previewSrc.set(null);
            }
        });
    }

    ngOnDestroy() {
        // clean up if needed via effect or manual if leak risk
        // effect cleanup handles it for reactive changes.
    }

    formatSize(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    download() {
        const file = this.compressedFile();
        if (!file) return;

        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}
