import {
  Component,
  ElementRef,
  ViewChild,
  signal,
  afterNextRender,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import ColorThief from 'colorthief';

// Type augmentation for ColorThief
declare module 'colorthief' {
  export default class ColorThief {
    constructor();
    getColor(img: HTMLImageElement): [number, number, number];
    getPalette(
      img: HTMLImageElement,
      colorCount?: number,
    ): [number, number, number][];
  }
}

interface ExtractedColor {
  hex: string;
  rgb: [number, number, number];
}

@Component({
  selector: 'app-palette-generator',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div
      class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 overflow-y-auto"
    >
      <header
        class="flex-none p-6 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
      >
        <h1 class="text-2xl font-bold text-slate-800 dark:text-slate-100">
          Cinematic Palette Generator
        </h1>
        <p class="text-slate-500 dark:text-slate-400">
          Extract dominant colors and create cinematic compositions.
        </p>
      </header>

      <div class="flex-1 p-6 overflow-y-auto">
        @if (!imageSrc()) {
          <div
            class="border-4 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-12 text-center cursor-pointer hover:border-primary hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            (dragover)="onDragOver($event)"
            (dragleave)="onDragLeave($event)"
            (drop)="onDrop($event)"
            (click)="fileInput.click()"
          >
            <input
              #fileInput
              type="file"
              accept="image/*"
              class="hidden"
              (change)="onFileSelected($event)"
            />
            <div class="text-6xl mb-4">🎨</div>
            <p class="text-lg text-slate-600 dark:text-slate-300">
              Drag & drop an image here, or click to select
            </p>
          </div>
        } @else {
          <div class="space-y-6">
            <div class="relative">
              <img
                #sourceImage
                [src]="imageSrc()"
                class="max-h-96 mx-auto rounded-lg shadow-lg object-contain"
                (load)="extractColors()"
                alt="Source"
              />
              <button
                (click)="reset()"
                class="absolute top-2 right-2 bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600"
              >
                Clear
              </button>
            </div>

            @if (extractedColors().length > 0) {
              <div class="bg-white dark:bg-slate-800 rounded-lg p-6 shadow">
                <h3
                  class="text-lg font-semibold mb-4 text-slate-800 dark:text-slate-100"
                >
                  Extracted Palette
                </h3>
                <div class="flex gap-2 mb-4">
                  @for (color of extractedColors(); track color.hex) {
                    <div
                      class="w-16 h-16 rounded-lg shadow cursor-pointer hover:scale-110 transition-transform"
                      [style.background-color]="color.hex"
                      (click)="copyColor(color.hex)"
                      [title]="'Click to copy: ' + color.hex"
                    ></div>
                  }
                </div>
                <div class="flex gap-2 flex-wrap">
                  @for (color of extractedColors(); track color.hex) {
                    <code
                      class="bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded text-sm"
                      >{{ color.hex }}</code
                    >
                  }
                </div>
              </div>
            }

            <div class="flex gap-4 items-center">
              <label class="text-slate-700 dark:text-slate-300"
                >Colors to extract:</label
              >
              <input
                type="range"
                min="3"
                max="10"
                [value]="paletteCount()"
                (input)="updatePaletteCount(+$any($event).target.value)"
                class="w-32"
              />
              <span class="text-slate-600 dark:text-slate-400">{{
                paletteCount()
              }}</span>
            </div>

            <button
              (click)="downloadCinematicImage()"
              class="bg-primary text-white px-6 py-2 rounded hover:bg-primary/90 transition-colors"
              [disabled]="extractedColors().length === 0"
            >
              Download Cinematic Image
            </button>
          </div>
        }
      </div>
    </div>
  `,
})
export class PaletteGeneratorComponent {
  @ViewChild('sourceImage') sourceImageRef!: ElementRef<HTMLImageElement>;
  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

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
        hex: this.rgbToHex(rgb[0], rgb[1], rgb[2]),
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
    return (
      '#' +
      ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()
    );
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
      ctx.fillRect(
        index * swatchWidth,
        img.naturalHeight,
        swatchWidth,
        stripHeight,
      );
    });

    // Export
    const link = document.createElement('a');
    link.download = `cinematic-palette-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }
}
