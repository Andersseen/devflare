import { Component, signal, inject } from '@angular/core';
import { BgRemoverService } from '@org/core';
import { LucideAngularModule } from 'lucide-angular';
import {
  VoltCard,
  VoltCardContent,
  VoltButton,
  VoltBadge,
} from '@voltui/components';

@Component({
  selector: 'app-bg-remover-page',
  imports: [
    LucideAngularModule,
    VoltCard,
    VoltCardContent,
    VoltButton,
    VoltBadge,
  ],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">AI Background Remover</h1>
        <p class="text-muted-foreground mt-1">Remove image backgrounds automatically directly in your browser</p>
      </div>

      @if (!originalUrl() && !isProcessing()) {
        <div
          class="border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-primary hover:bg-accent/50 transition-all"
          (dragover)="$event.preventDefault()"
          (drop)="onDrop($event)"
          (click)="fileInput.click()"
        >
          <input #fileInput type="file" accept="image/*" class="hidden" (change)="onFileSelected($event)">
          <lucide-icon name="image" class="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p class="text-lg font-medium">Drag & Drop your image here</p>
          <p class="text-sm text-muted-foreground mt-2">Supports JPG, PNG, WEBP</p>
          <volt-button variant="outline" class="mt-6">
            Browse Files
          </volt-button>
        </div>
      }

      @if (isProcessing()) {
        <div class="text-center py-12">
          <div class="relative w-24 h-24 mx-auto mb-6">
            <div class="absolute inset-0 border-4 border-border rounded-full"></div>
            <div class="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin"></div>
          </div>
          <h3 class="text-xl font-bold mb-2">Analyzing image with AI...</h3>
          <p class="text-muted-foreground max-w-sm mx-auto">This runs locally in your browser and might take a few seconds.</p>
        </div>
      }

      @if (originalUrl() && resultUrl() && !isProcessing()) {
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <volt-button size="sm" variant="ghost" (click)="reset()">
              <lucide-icon name="arrow-left" class="w-4 h-4 mr-1" />
              Try Another
            </volt-button>
            <volt-button variant="solid" (click)="download()">
              <lucide-icon name="download" class="w-4 h-4 mr-1" />
              Download PNG
            </volt-button>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <volt-card>
              <volt-card-content class="relative flex items-center justify-center p-4 min-h-[300px]">
                <span class="absolute top-3 left-3 bg-black/50 text-white text-xs px-2 py-1 rounded">Original</span>
                <img [src]="originalUrl()" class="max-w-full max-h-[400px] object-contain" alt="Original">
              </volt-card-content>
            </volt-card>

            <volt-card>
              <volt-card-content class="relative flex items-center justify-center p-4 min-h-[300px] checkerboard">
                <span class="absolute top-3 left-3 bg-green-600/90 text-white text-xs px-2 py-1 rounded z-10">Removed Background</span>
                <img [src]="resultUrl()" class="max-w-full max-h-[400px] object-contain relative z-10" alt="Result">
              </volt-card-content>
            </volt-card>
          </div>
        </div>
      }

      @if (errorMsg()) {
        <div class="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm flex items-center gap-3">
          <lucide-icon name="alert-circle" class="w-5 h-5 shrink-0" />
          {{ errorMsg() }}
          <button (click)="reset()" class="ml-auto text-sm underline font-medium">Try again</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .checkerboard {
      background-color: #f8fafc;
      background-image:
        linear-gradient(45deg, #e2e8f0 25%, transparent 25%),
        linear-gradient(-45deg, #e2e8f0 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #e2e8f0 75%),
        linear-gradient(-45deg, transparent 75%, #e2e8f0 75%);
      background-size: 20px 20px;
      background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
    }
  `],
})
export default class BgRemoverPageComponent {
  isProcessing = signal(false);
  originalUrl = signal<string | null>(null);
  resultUrl = signal<string | null>(null);
  errorMsg = signal<string | null>(null);

  private resultBlob: Blob | null = null;

  private bgRemoverService = inject(BgRemoverService);

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

  async handleFile(file: File) {
    if (!file.type.match('image.*')) {
      this.errorMsg.set('Please select a valid image file (JPG, PNG, WEBP).');
      return;
    }

    this.errorMsg.set(null);
    this.isProcessing.set(true);

    const objectUrl = URL.createObjectURL(file);
    this.originalUrl.set(objectUrl);

    try {
      this.resultBlob = await this.bgRemoverService.removeBackground(file);
      const resultUrl = URL.createObjectURL(this.resultBlob);
      this.resultUrl.set(resultUrl);
    } catch (err: any) {
      console.error('Background removal failed', err);
      this.errorMsg.set('Failed to process image. Please try another one.');
      this.resultBlob = null;
    } finally {
      this.isProcessing.set(false);
    }
  }

  download() {
    if (this.resultBlob) {
      this.bgRemoverService.downloadResult(this.resultBlob);
    }
  }

  reset() {
    this.isProcessing.set(false);
    this.originalUrl.set(null);
    this.resultUrl.set(null);
    this.errorMsg.set(null);
    this.resultBlob = null;
  }
}
