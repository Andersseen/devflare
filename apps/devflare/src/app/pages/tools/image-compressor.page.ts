import { Component, signal, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ImageCompressor } from '@org/core';
import { LucideAngularModule } from 'lucide-angular';
import {
  VoltCard,
  VoltCardHeader,
  VoltCardTitle,
  VoltCardContent,
  VoltButton,
  VoltBadge,
  VoltSlider,
} from '@voltui/components';

@Component({
  selector: 'app-image-compressor-page',
  imports: [
    FormsModule,
    LucideAngularModule,
    VoltCard,
    VoltCardHeader,
    VoltCardTitle,
    VoltCardContent,
    VoltButton,
    VoltBadge,
    VoltSlider,
  ],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">Image Compressor</h1>
        <p class="text-muted-foreground mt-1">Smart compression with WebWorkers. Reduce file size without compromising quality.</p>
      </div>

      @if (!originalFile()) {
        <div
          class="border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-primary hover:bg-accent/50 transition-all"
          tabindex="0"
          role="button"
          (dragover)="onDragOver($event)"
          (drop)="onDrop($event)"
          (click)="fileInput.click()"
          (keydown.enter)="fileInput.click()"
          (keydown.space)="fileInput.click()"
        >
          <input #fileInput type="file" accept="image/*" class="hidden" (change)="onFileSelected($event)">
          <lucide-icon name="upload" class="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p class="text-lg font-medium">Drop your image here</p>
          <p class="text-sm text-muted-foreground mt-1">or click to browse — supports PNG, JPG, WEBP</p>
        </div>
      } @else {
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <volt-button size="sm" variant="ghost" (click)="reset()">
              <lucide-icon name="arrow-left" class="w-4 h-4 mr-1" />
              Upload new
            </volt-button>
            @if (isProcessing()) {
              <volt-badge variant="secondary">
                <lucide-icon name="loader" class="animate-spin w-3 h-3 mr-1" />
                Processing...
              </volt-badge>
            }
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Original -->
            <volt-card>
              <volt-card-header>
                <volt-card-title>Original</volt-card-title>
              </volt-card-header>
              <volt-card-content>
                <img [src]="originalPreview()" class="max-h-64 mx-auto rounded-lg object-contain" alt="Original">
                <div class="mt-4 text-center">
                  <p class="text-sm text-muted-foreground">{{ formatSize(originalSize()) }}</p>
                  <p class="text-xs text-muted-foreground">{{ originalDimensions() }}</p>
                </div>
              </volt-card-content>
            </volt-card>

            <!-- Compressed -->
            <volt-card>
              <volt-card-header class="flex flex-row items-center justify-between">
                <volt-card-title>Compressed</volt-card-title>
                @if (savings() > 0) {
                  <volt-badge variant="solid">-{{ savings() }}%</volt-badge>
                }
              </volt-card-header>
              <volt-card-content>
                <img [src]="compressedPreview()" class="max-h-64 mx-auto rounded-lg object-contain" alt="Compressed">
                <div class="mt-4 text-center">
                  <p class="text-sm font-medium">{{ formatSize(compressedSize()) }}</p>
                  <p class="text-xs text-green-600">Saved {{ formatSize(originalSize() - compressedSize()) }}</p>
                </div>
              </volt-card-content>
            </volt-card>
          </div>

          <!-- Controls -->
          <volt-card>
            <volt-card-header>
              <volt-card-title>Settings</volt-card-title>
            </volt-card-header>
            <volt-card-content class="space-y-4">
              <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label for="quality" class="text-sm font-medium block mb-2">Quality: {{ quality() }}%</label>
                  <input id="quality" type="range" min="10" max="100" [value]="quality()" (change)="quality.set(+$any($event).target.value); processImage()" class="w-full">
                </div>
                <div>
                  <label for="maxWidth" class="text-sm font-medium block mb-2">Max Width: {{ maxWidth() > 0 ? maxWidth() + 'px' : 'Original' }}</label>
                  <input id="maxWidth" type="range" min="0" max="3000" step="100" [value]="maxWidth()" (change)="maxWidth.set(+$any($event).target.value); processImage()" class="w-full">
                </div>
                <div>
                  <label for="format" class="text-sm font-medium block mb-2">Format</label>
                  <select id="format" [(ngModel)]="format" (change)="processImage()" class="w-full h-10 rounded-md border border-border bg-background px-3 text-sm">
                    <option value="image/jpeg">JPEG</option>
                    <option value="image/png">PNG</option>
                    <option value="image/webp">WebP</option>
                  </select>
                </div>
              </div>
              <volt-button variant="solid" class="w-full" (click)="download()" [disabled]="!compressedFile() || isProcessing()">
                <lucide-icon name="download" class="w-4 h-4 mr-2" />
                Download Compressed
              </volt-button>
            </volt-card-content>
          </volt-card>
        </div>
      }
    </div>
  `,
})
export default class ImageCompressorPage {
  originalFile = signal<File | null>(null);
  compressedFile = signal<File | null>(null);
  originalPreview = signal<string>('');
  compressedPreview = signal<string>('');
  isProcessing = signal(false);

  quality = signal(80);
  maxWidth = signal(0);
  format = signal('image/jpeg');

  originalSize = computed(() => this.originalFile()?.size || 0);
  compressedSize = computed(() => this.compressedFile()?.size || 0);
  savings = computed(() =>
    this.#imageCompressorService.getSavingsPercent(this.originalSize(), this.compressedSize())
  );
  originalDimensions = computed(() => {
    // This would need an actual image load, keeping simple for now
    return '';
  });

  #imageCompressorService = inject(ImageCompressor);

  onDragOver(event: DragEvent) {
    event.preventDefault();
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    const files = event.dataTransfer?.files;
    if (files?.length) {
      this.handleFile(files[0]);
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.handleFile(input.files[0]);
    }
  }

  async handleFile(file: File) {
    if (!file.type.startsWith('image/')) return;
    this.originalFile.set(file);
    this.originalPreview.set(URL.createObjectURL(file));
    await this.processImage();
  }

  async processImage() {
    const file = this.originalFile();
    if (!file) return;

    this.isProcessing.set(true);
    try {
      const compressed = await this.#imageCompressorService.compress(file, {
        quality: this.quality(),
        maxWidth: this.maxWidth(),
        format: this.format(),
      });
      this.compressedFile.set(compressed);
      this.compressedPreview.set(URL.createObjectURL(compressed));
    } catch (err) {
      console.error('Compression error:', err);
    } finally {
      this.isProcessing.set(false);
    }
  }

  reset() {
    this.originalFile.set(null);
    this.compressedFile.set(null);
    this.originalPreview.set('');
    this.compressedPreview.set('');
  }

  formatSize(bytes: number): string {
    return this.#imageCompressorService.formatSize(bytes);
  }

  download() {
    const file = this.compressedFile();
    if (!file) return;
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'compressed-' + file.name.replace(/\.[^/.]+$/, '') + '.' + this.format().split('/')[1];
    a.click();
    URL.revokeObjectURL(url);
  }
}
