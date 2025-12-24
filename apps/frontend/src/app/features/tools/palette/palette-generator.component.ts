import { Component, ElementRef, ViewChild, signal, afterNextRender } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import ColorThief from 'colorthief';

interface ExtractedColor {
    hex: string;
    rgb: [number, number, number];
}

@Component({
    selector: 'app-palette-generator',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
    <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 overflow-y-auto">
      <header class="flex-none p-6 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <h1 class="text-2xl font-bold text-slate-800 dark:text-slate-100">Cinematic Palette Generator</h1>
        <p class="text-slate-500 dark:text-slate-400">Extract dominant colors and create cinematic compositions.</p>
      </header>

      <div class="flex-1 p-6 flex flex-col items-center gap-8">
        
        <!-- Controls -->
        @if (imageSrc()) {
            <div class="w-full max-w-4xl bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-4">
               
               <div class="flex items-center gap-6">
                   <div class="flex items-center gap-3">
                       <label class="text-sm font-medium text-slate-700 dark:text-slate-300">Palette Size:</label>
                       <div class="flex bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
                           @for (count of [3, 5, 8]; track count) {
                               <button 
                                 (click)="updatePaletteCount(count)"
                                 [class.bg-white]="paletteCount() === count"
                                 [class.dark:bg-slate-600]="paletteCount() === count"
                                 [class.shadow-sm]="paletteCount() === count"
                                 class="px-3 py-1 text-sm font-medium rounded-md transition-all text-slate-600 dark:text-slate-300">
                                 {{ count }}
                               </button>
                           }
                       </div>
                   </div>
               </div>

               <div class="flex items-center gap-3">
                   <button 
                     (click)="reset()"
                     class="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 font-medium rounded-lg transition-colors">
                     Reset
                   </button>
                   <button 
                     (click)="downloadCinematicImage()"
                     class="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2 shadow-sm">
                     <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                     Download Wallpaper
                   </button>
               </div>
            </div>
        }

        <!-- Drag & Drop / Preview Area -->
        <div class="w-full max-w-4xl">
            @if (!imageSrc()) {
                <div 
                    (dragover)="onDragOver($event)"
                    (dragleave)="onDragLeave($event)"
                    (drop)="onDrop($event)"
                    class="w-full h-96 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 flex flex-col items-center justify-center p-8 transition-all hover:border-indigo-500/50 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 cursor-pointer"
                    [class.border-indigo-500]="isDragging"
                    [class.bg-indigo-50]="isDragging">
                    
                    <div class="w-20 h-20 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mb-6">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-10 h-10 text-slate-400">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                        </svg>
                    </div>
                    
                    <p class="text-lg font-medium text-slate-700 dark:text-slate-200 mb-2">Drag & Drop an image</p>
                    <p class="text-sm text-slate-500 mb-6">JPG, PNG, WEBP (Max 10MB)</p>
                    
                    <label class="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg cursor-pointer transition-colors shadow-lg shadow-indigo-500/30">
                        <span>Select Image</span>
                        <input type="file" class="hidden" accept="image/*" (change)="onFileSelected($event)">
                    </label>
                </div>
            } @else {
                <!-- Preview Container -->
                <div class="bg-black/5 p-2 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden">
                    <div class="relative group">
                         <!-- Main Image -->
                         <img 
                            #sourceImage
                            [src]="imageSrc()" 
                            (load)="extractColors()"
                            class="w-full h-auto block rounded-t-lg bg-slate-100 dark:bg-slate-900"
                            crossorigin="anonymous"
                            alt="Source">
                         
                         <!-- Palette Strip -->
                         <div class="flex w-full h-24 md:h-32 rounded-b-lg overflow-hidden">
                            @for (color of extractedColors(); track $index) {
                                <div 
                                    class="flex-1 relative group/color cursor-pointer transition-all hover:flex-[1.5]"
                                    [style.background-color]="color.hex"
                                    (click)="copyColor(color.hex)">
                                    
                                    <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover/color:opacity-100 transition-opacity bg-black/20 backdrop-blur-[2px]">
                                        <div class="text-white font-mono text-sm md:text-base font-bold drop-shadow-md flex flex-col items-center gap-1">
                                            <span>{{ color.hex }}</span>
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                                        </div>
                                    </div>
                                </div>
                            }
                         </div>
                    </div>
                </div>
            }
        </div>
      </div>
    </div>
  `,
    styles: [`
    :host {
      display: block;
      height: 100%;
    }
  `]
})
export class PaletteGeneratorComponent {
    @ViewChild('sourceImage') sourceImageRef!: ElementRef<HTMLImageElement>;

    imageSrc = signal<string | null>(null);
    extractedColors = signal<ExtractedColor[]>([]);
    paletteCount = signal<number>(5);
    isDragging = false;

    private colorThief = new ColorThief();

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

    handleFile(file: File) {
        if (!file.type.match('image.*')) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            this.imageSrc.set(e.target?.result as string);
        };
        reader.readAsDataURL(file);
    }

    extractColors() {
        if (!this.sourceImageRef?.nativeElement) return;

        const img = this.sourceImageRef.nativeElement;

        // Make sure image is loaded
        if (!img.complete) return;

        try {
            const palette = this.colorThief.getPalette(img, this.paletteCount() || 5);
            const colors: ExtractedColor[] = palette.map((rgb: number[]) => ({
                rgb: [rgb[0], rgb[1], rgb[2]],
                hex: this.rgbToHex(rgb[0], rgb[1], rgb[2])
            }));

            this.extractedColors.set(colors);
        } catch (e) {
            console.error('Error extracting colors', e);
        }
    }

    updatePaletteCount(count: number) {
        this.paletteCount.set(count);
        setTimeout(() => this.extractColors(), 50); // Small delay to ensuring signal update propogates if needed, though extracting directly is usually fine.
    }

    reset() {
        this.imageSrc.set(null);
        this.extractedColors.set([]);
    }

    copyColor(hex: string) {
        navigator.clipboard.writeText(hex);
        // Could add toast here
    }

    rgbToHex(r: number, g: number, b: number) {
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
    }

    downloadCinematicImage() {
        if (!this.imageSrc() || this.extractedColors().length === 0) return;

        const img = this.sourceImageRef.nativeElement;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) return;

        // Layout calculation
        // We want the image + a strip at the bottom.
        // Let's say strip height is 20% of image height
        const stripHeight = Math.round(img.naturalHeight * 0.2);
        const totalHeight = img.naturalHeight + stripHeight;

        canvas.width = img.naturalWidth;
        canvas.height = totalHeight;

        // Draw Image
        ctx.drawImage(img, 0, 0);

        // Draw Palette Strip
        const colors = this.extractedColors();
        const swatchWidth = canvas.width / colors.length;

        colors.forEach((color, index) => {
            ctx.fillStyle = color.hex;
            ctx.fillRect(index * swatchWidth, img.naturalHeight, swatchWidth, stripHeight);
        });

        // Export
        const link = document.createElement('a');
        link.download = `cinematic-palette-${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    }
}
