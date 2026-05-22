import { Component, ElementRef, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import ColorThief from 'colorthief';

declare module 'colorthief' {
  export default class ColorThief {
    constructor();
    getColor(img: HTMLImageElement): [number, number, number];
    getPalette(img: HTMLImageElement, colorCount?: number): [number, number, number][];
  }
}
import { LucideAngularModule } from 'lucide-angular';
import {
  VoltCard,
  VoltCardHeader,
  VoltCardTitle,
  VoltCardContent,
  VoltButton,
  VoltSlider,
  VoltBadge,
} from '@voltui/components';

interface ExtractedColor {
  hex: string;
  rgb: [number, number, number];
}

@Component({
  selector: 'app-palette-page',
  imports: [
    FormsModule,
    LucideAngularModule,
    VoltCard,
    VoltCardHeader,
    VoltCardTitle,
    VoltCardContent,
    VoltButton,
    VoltSlider,
    VoltBadge,
  ],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">Cinematic Palette</h1>
        <p class="text-muted-foreground mt-1">Extract dominant colors and create cinematic compositions</p>
      </div>

      @if (!imageSrc()) {
        <div
          class="border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-primary hover:bg-accent/50 transition-all"
          (dragover)="$event.preventDefault()"
          (drop)="onDrop($event)"
          (click)="fileInput.click()"
        >
          <input #fileInput type="file" accept="image/*" class="hidden" (change)="onFileSelected($event)">
          <lucide-icon name="palette" class="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p class="text-lg text-muted-foreground">Drag & drop an image here, or click to select</p>
        </div>
      } @else {
        <div class="space-y-6">
          <!-- Source Image -->
          <div class="relative">
            <img
              #sourceImage
              [src]="imageSrc()"
              class="max-h-96 mx-auto rounded-lg shadow-lg object-contain"
              (load)="extractColors()"
              alt="Source"
            />
            <volt-button size="sm" variant="destructive" class="absolute top-2 right-2" (click)="reset()">
              <lucide-icon name="x" class="w-4 h-4 mr-1" />
              Clear
            </volt-button>
          </div>

          <!-- Extracted Palette -->
          @if (extractedColors().length > 0) {
            <volt-card>
              <volt-card-header>
                <volt-card-title>Extracted Palette</volt-card-title>
              </volt-card-header>
              <volt-card-content>
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
                    <code class="bg-muted px-2 py-1 rounded text-sm">{{ color.hex }}</code>
                  }
                </div>
              </volt-card-content>
            </volt-card>
          }

          <!-- Controls -->
          <volt-card>
            <volt-card-content class="flex flex-col sm:flex-row gap-4 items-center">
              <label class="text-sm font-medium whitespace-nowrap">Colors to extract:</label>
              <input
                type="range"
                min="3"
                max="10"
                [value]="'' + paletteCount()"
                (input)="updatePaletteCount(+$any($event).target.value)"
                class="flex-1 w-full"
              />
              <span class="text-sm text-muted-foreground w-6">{{ paletteCount() }}</span>
            </volt-card-content>
          </volt-card>

          <volt-button variant="solid" (click)="downloadCinematicImage()" [disabled]="extractedColors().length === 0">
            <lucide-icon name="download" class="w-4 h-4 mr-2" />
            Download Cinematic Image
          </volt-button>
        </div>
      }
    </div>
  `,
})
export default class PalettePageComponent {
  @ViewChild('sourceImage') sourceImageRef!: ElementRef<HTMLImageElement>;

  imageSrc = signal<string | null>(null);
  extractedColors = signal<ExtractedColor[]>([]);
  paletteCount = signal<number>(5);

  private colorThief = new ColorThief();

  onDrop(e: DragEvent) {
    e.preventDefault();
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
    if (!img.complete) return;

    try {
      const palette = this.colorThief.getPalette(img, this.paletteCount() || 5);
      const colors: ExtractedColor[] = palette.map((rgb: number[]) => ({
        rgb: [rgb[0], rgb[1], rgb[2]] as [number, number, number],
        hex: this.rgbToHex(rgb[0], rgb[1], rgb[2]),
      }));
      this.extractedColors.set(colors);
    } catch (e) {
      console.error('Error extracting colors', e);
    }
  }

  updatePaletteCount(count: number) {
    this.paletteCount.set(count);
    setTimeout(() => this.extractColors(), 50);
  }

  reset() {
    this.imageSrc.set(null);
    this.extractedColors.set([]);
  }

  copyColor(hex: string) {
    navigator.clipboard.writeText(hex);
  }

  rgbToHex(r: number, g: number, b: number) {
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
  }

  downloadCinematicImage() {
    if (!this.imageSrc() || this.extractedColors().length === 0) return;

    const img = this.sourceImageRef.nativeElement;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const stripHeight = Math.round(img.naturalHeight * 0.2);
    const totalHeight = img.naturalHeight + stripHeight;

    canvas.width = img.naturalWidth;
    canvas.height = totalHeight;

    ctx.drawImage(img, 0, 0);

    const colors = this.extractedColors();
    const swatchWidth = canvas.width / colors.length;

    colors.forEach((color, index) => {
      ctx.fillStyle = color.hex;
      ctx.fillRect(index * swatchWidth, img.naturalHeight, swatchWidth, stripHeight);
    });

    const link = document.createElement('a');
    link.download = `cinematic-palette-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }
}
