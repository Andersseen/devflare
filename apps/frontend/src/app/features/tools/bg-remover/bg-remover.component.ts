import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { removeBackground } from '@imgly/background-removal';

@Component({
    selector: 'app-bg-remover',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 overflow-y-auto">
      <header class="flex-none p-6 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <h1 class="text-2xl font-bold text-slate-800 dark:text-slate-100">AI Background Remover</h1>
        <p class="text-slate-500 dark:text-slate-400">Remove image backgrounds automatically directly in your browser.</p>
      </header>

      <div class="flex-1 p-6 flex flex-col items-center justify-center">
        
        <!-- Upload State -->
        @if (!originalUrl() && !isProcessing()) {
            <div 
                (dragover)="onDragOver($event)"
                (dragleave)="onDragLeave($event)"
                (drop)="onDrop($event)"
                class="w-full max-w-2xl h-80 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 flex flex-col items-center justify-center p-8 transition-all hover:border-primary/50 hover:bg-primary/5"
                [class.border-primary]="isDragging"
                [class.bg-primary-50]="isDragging">
                
                <div class="w-20 h-20 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mb-6">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-10 h-10 text-slate-400">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                    </svg>
                </div>
                
                <p class="text-lg font-medium text-slate-700 dark:text-slate-200 mb-2">Drag & Drop your image here</p>
                <p class="text-sm text-slate-500 mb-6">Supports JPG, PNG, WEBP (Max 10MB)</p>
                
                <label class="px-6 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-lg cursor-pointer transition-colors">
                    <span>Browse Files</span>
                    <input type="file" class="hidden" accept="image/*" (change)="onFileSelected($event)">
                </label>
            </div>
        }

        <!-- Processing State -->
        @if (isProcessing()) {
            <div class="text-center">
                <div class="relative w-24 h-24 mx-auto mb-6">
                    <div class="absolute inset-0 border-4 border-slate-200 dark:border-slate-700 rounded-full"></div>
                    <div class="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin"></div>
                </div>
                <h3 class="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Analyzing image with AI...</h3>
                <p class="text-slate-500 dark:text-slate-400 max-w-sm">This runs locally in your browser and might take a few seconds.</p>
            </div>
        }

        <!-- Result View -->
        @if (originalUrl() && resultUrl() && !isProcessing()) {
            <div class="w-full h-full flex flex-col overflow-hidden">
                <div class="flex-none flex items-center justify-between mb-4 px-4 container mx-auto">
                     <button 
                        (click)="reset()"
                        class="text-sm font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/></svg>
                        Try Another
                     </button>
                     
                     <div class="flex items-center gap-2">
                        <button 
                            (click)="download()"
                            class="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2 shadow-sm">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                            Download PNG
                        </button>
                     </div>
                </div>

                <div class="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 h-full min-h-0 container mx-auto px-4 pb-6">
                    <!-- Original -->
                    <div class="bg-white dark:bg-slate-800 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 relative group flex items-center justify-center p-4">
                        <span class="absolute top-4 left-4 bg-black/50 text-white text-xs px-2 py-1 rounded backdrop-blur">Original</span>
                        <img [src]="originalUrl()" class="max-w-full max-h-full object-contain" alt="Original">
                    </div>

                    <!-- Result -->
                    <div class="bg-white dark:bg-slate-800 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 relative group flex items-center justify-center p-4 bg-checkerboard">
                         <span class="absolute top-4 left-4 bg-emerald-600/90 text-white text-xs px-2 py-1 rounded backdrop-blur z-10">Removed Background</span>
                         <img [src]="resultUrl()" class="max-w-full max-h-full object-contain relative z-10" alt="Result">
                    </div>
                </div>
            </div>
        }
        
        @if (errorMsg()) {
            <div class="mt-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 flex items-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {{ errorMsg() }}
                <button (click)="reset()" class="ml-auto text-sm underline font-medium">Try again</button>
            </div>
        }
      </div>
    </div>
  `,
    styles: [`
    :host {
      display: block;
      height: 100%;
    }
    .bg-checkerboard {
        background-color: #f8fafc;
        background-image:
          linear-gradient(45deg, #e2e8f0 25%, transparent 25%),
          linear-gradient(-45deg, #e2e8f0 25%, transparent 25%),
          linear-gradient(45deg, transparent 75%, #e2e8f0 75%),
          linear-gradient(-45deg, transparent 75%, #e2e8f0 75%);
        background-size: 20px 20px;
        background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
    }
    :host-context(.dark) .bg-checkerboard {
        background-color: #1e293b;
         background-image:
          linear-gradient(45deg, #334155 25%, transparent 25%),
          linear-gradient(-45deg, #334155 25%, transparent 25%),
          linear-gradient(45deg, transparent 75%, #334155 75%),
          linear-gradient(-45deg, transparent 75%, #334155 75%);
    }
  `]
})
export class BgRemoverComponent {
    isProcessing = signal(false);
    originalUrl = signal<string | null>(null);
    resultUrl = signal<string | null>(null);
    errorMsg = signal<string | null>(null);

    isDragging = false;

    onDragOver(e: DragEvent) {
        e.preventDefault();
        this.isDragging = true;
    }

    onDragLeave(e: DragEvent) {
        e.preventDefault();
        this.isDragging = false;
    }

    onDrop(e: DragEvent) {
        e.preventDefault();
        this.isDragging = false;
        if (e.dataTransfer?.files.length) {
            this.handleFile(e.dataTransfer.files[0]);
        }
    }

    onFileSelected(e: Event) {
        const input = e.target as HTMLInputElement;
        if (input.files?.length) {
            this.handleFile(input.files[0]);
        }
    }

    async handleFile(file: File) {
        if (!file.type.match('image.*')) {
            this.errorMsg.set('Please select a valid image file (JPG, PNG, WEBP).');
            return;
        }

        this.errorMsg.set(null);
        this.isProcessing.set(true);

        // Create preview of original
        const objectUrl = URL.createObjectURL(file);
        this.originalUrl.set(objectUrl);

        try {
            // imgly logic
            // default config downloads assets from CDN
            const blob = await removeBackground(file);

            const resultUrl = URL.createObjectURL(blob);
            this.resultUrl.set(resultUrl);

        } catch (err: any) {
            console.error('Background removal failed', err);
            this.errorMsg.set('Failed to process image. Please try another one.');
        } finally {
            this.isProcessing.set(false);
        }
    }

    download() {
        const url = this.resultUrl();
        if (!url) return;

        const a = document.createElement('a');
        a.href = url;
        a.download = 'removed-bg-' + Date.now() + '.png';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => document.body.removeChild(a), 100);
    }

    reset() {
        this.isProcessing.set(false);
        this.originalUrl.set(null);
        this.resultUrl.set(null);
        this.errorMsg.set(null);
    }
}
