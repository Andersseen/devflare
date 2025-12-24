import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, debounceTime } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { UploaderComponent } from '../../../components/uploader/uploader.component';
import { ControlPanelComponent, ProcessingConfig } from '../../../components/control-panel/control-panel.component';
import { PreviewComponent } from '../../../components/preview/preview.component';
import { ImageProcessingService } from '@core-services/image-processing.service';

@Component({
    selector: 'app-tools-compressor',
    standalone: true,
    imports: [CommonModule, UploaderComponent, ControlPanelComponent, PreviewComponent],
    template: `
    <div class="h-full flex flex-col p-4 md:p-8">
           @if (!originalFile()) {
               <div class="flex-1 flex flex-col justify-center max-w-2xl mx-auto w-full animate-in fade-in zoom-in duration-500">
                   <div class="text-center mb-12 space-y-4">
                       <h2 class="text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                           Optimize your images.
                       </h2>
                       <p class="text-lg text-slate-600 dark:text-slate-400 max-w-lg mx-auto leading-relaxed">
                           Smart compression for PNG, JPG and WEBP. Reduce file size without compromising quality.
                       </p>
                   </div>
                   <app-uploader (fileDropped)="onFileSelected($event)"></app-uploader>
               </div>
           } @else {
               <div class="flex flex-col lg:flex-row h-full gap-6 animate-in slide-in-from-bottom-4 duration-500">
                    <!-- Preview Area -->
                    <div class="flex-1 flex flex-col min-w-0">
                        <div class="mb-4 flex items-center justify-between">
                            <button 
                                (click)="reset()" 
                                class="group px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 transition-all flex items-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 transition-transform group-hover:-translate-x-1">
                                  <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                                </svg>
                                Upload new
                            </button>
                        </div>
                        
                        <app-preview 
                            [originalFile]="originalFile()"
                            [compressedFile]="compressedFile()"
                            [isLoading]="imageService.isProcessing()"
                            class="flex-1 min-h-0"
                        ></app-preview>
                    </div>
                    
                    <!-- Controls Sidebar -->
                    <div class="w-full lg:w-80 shrink-0">
                        <app-control-panel (configChanged)="onConfigChanged($event)"></app-control-panel>
                    </div>
               </div>
           }
    </div>
  `
})
export class ToolsCompressorComponent {
    imageService = inject(ImageProcessingService);

    originalFile = signal<File | null>(null);
    compressedFile = signal<File | null>(null);

    currentConfig = signal<ProcessingConfig>({
        quality: 80,
        format: 'image/jpeg',
        maxWidth: 0
    });

    private processQueue$ = new Subject<void>();

    constructor() {
        this.processQueue$.pipe(
            debounceTime(300),
            takeUntilDestroyed()
        ).subscribe(() => {
            this.processImage();
        });
    }

    onFileSelected(file: File) {
        this.originalFile.set(file);
        this.processImage();
    }

    onConfigChanged(config: ProcessingConfig) {
        this.currentConfig.set(config);
        this.processQueue$.next();
    }

    reset() {
        this.originalFile.set(null);
        this.compressedFile.set(null);
    }

    async processImage() {
        const file = this.originalFile();
        const config = this.currentConfig();
        if (!file) return;

        try {
            const result = await this.imageService.compress(file, {
                maxSizeMB: 1000,
                useWebWorker: true,
                fileType: config.format,
                maxWidthOrHeight: config.maxWidth > 0 ? config.maxWidth : undefined,
                initialQuality: config.quality / 100
            });

            this.compressedFile.set(result.file);
        } catch (err) {
            console.error('Compression error:', err);
        }
    }
}
