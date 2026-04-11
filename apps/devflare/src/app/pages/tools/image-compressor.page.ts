import { Component, signal, computed } from '@angular/core';
import { CardComponent, ButtonComponent, BadgeComponent } from '@org/ui';

@Component({
  selector: 'app-image-compressor-page',
  standalone: true,
  imports: [CardComponent, ButtonComponent, BadgeComponent],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">Image Compressor</h1>
        <p class="text-muted-foreground mt-1">Optimize your images for the web</p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Upload -->
        <ui-card title="Upload Image">
          <div 
            class="mt-4 border-2 border-dashed border-border rounded-lg p-8 text-center hover:bg-accent/50 transition-colors cursor-pointer"
            (dragover)="onDragOver($event)"
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
            <svg class="w-12 h-12 text-muted-foreground mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p class="font-medium">Drop your image here</p>
            <p class="text-sm text-muted-foreground mt-1">or click to browse</p>
          </div>
        </ui-card>

        <!-- Preview -->
        @if (originalFile()) {
          <ui-card title="Preview">
            <div class="mt-4 space-y-4">
              <!-- Stats -->
              <div class="grid grid-cols-2 gap-4">
                <div class="p-4 bg-muted rounded-lg">
                  <p class="text-sm text-muted-foreground">Original</p>
                  <p class="text-xl font-bold">{{ formatSize(originalSize()) }}</p>
                </div>
                @if (compressedFile()) {
                  <div class="p-4 bg-green-500/10 rounded-lg">
                    <p class="text-sm text-green-600">Compressed</p>
                    <div class="flex items-center gap-2">
                      <p class="text-xl font-bold text-green-600">{{ formatSize(compressedSize()) }}</p>
                      <ui-badge variant="success">-{{ savings() }}%</ui-badge>
                    </div>
                  </div>
                }
              </div>

              <!-- Image Preview -->
              <div class="aspect-video bg-muted rounded-lg overflow-hidden flex items-center justify-center">
                @if (previewUrl()) {
                  <img [src]="previewUrl()" class="max-h-full max-w-full object-contain" alt="Preview" />
                }
              </div>

              <!-- Actions -->
              @if (compressedFile()) {
                <ui-button (click)="download()" [fullWidth]="true">
                  <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download Compressed
                </ui-button>
              }
            </div>
          </ui-card>
        }
      </div>
    </div>
  `,
})
export default class ImageCompressorPageComponent {
  originalFile = signal<File | null>(null);
  compressedFile = signal<File | null>(null);
  previewUrl = signal<string>('');

  originalSize = computed(() => this.originalFile()?.size || 0);
  compressedSize = computed(() => this.compressedFile()?.size || 0);
  savings = computed(() => {
    if (!this.originalSize() || !this.compressedSize()) return 0;
    return Math.round((1 - this.compressedSize() / this.originalSize()) * 100);
  });

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
    this.previewUrl.set(URL.createObjectURL(file));

    // Simple compression using canvas
    const compressed = await this.compressImage(file);
    this.compressedFile.set(compressed);
  }

  compressImage(file: File): Promise<File> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;

        // Scale down if too large
        let { width, height } = img;
        const maxSize = 1200;
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = (height / width) * maxSize;
            width = maxSize;
          } else {
            width = (width / height) * maxSize;
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(new File([blob], file.name, { type: 'image/jpeg' }));
            }
          },
          'image/jpeg',
          0.8
        );
      };
      img.src = URL.createObjectURL(file);
    });
  }

  formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  download() {
    const file = this.compressedFile();
    if (!file) return;

    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'compressed-' + file.name;
    a.click();
    URL.revokeObjectURL(url);
  }
}
