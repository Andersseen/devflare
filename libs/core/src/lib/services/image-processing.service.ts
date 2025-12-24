import { Injectable, signal, inject, NgZone } from '@angular/core';
import imageCompression from 'browser-image-compression';

export interface CompressionOptions {
  maxSizeMB: number;
  maxWidthOrHeight?: number;
  useWebWorker: boolean;
  fileType?: string; // 'image/jpeg', 'image/png', 'image/webp'
  initialQuality?: number; // 0 to 1
}

export interface CompressionResult {
  file: File;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
}

@Injectable({
  providedIn: 'root'
})
export class ImageProcessingService {
  isProcessing = signal(false);
  private ngZone = inject(NgZone);

  constructor() { }

  /**
   * Compresses an image file based on the provided options.
   */
  async compress(file: File, options: CompressionOptions): Promise<CompressionResult> {
    this.isProcessing.set(true);

    // Run outside Angular to avoid blocking change detection cycle with heavy tasks
    // browser-image-compression uses web workers if enabled, but initial setup/teardown 
    // and Blob handling can still tick dirty check if inside zone.
    try {
      const compressedBlob = await this.ngZone.runOutsideAngular(async () => {
        // Yield to main thread to ensure UI updates (spinner) before potentially heavy work
        await new Promise(resolve => setTimeout(resolve, 100));

        // Map our options to library options
        const libOptions = {
          maxSizeMB: options.maxSizeMB,
          maxWidthOrHeight: options.maxWidthOrHeight,
          useWebWorker: options.useWebWorker,
          fileType: options.fileType,
          initialQuality: options.initialQuality
        };
        return await imageCompression(file, libOptions);
      });

      const newFileName = this.getNewFileName(file.name, options.fileType);
      const compressedFile = new File([compressedBlob], newFileName, {
        type: compressedBlob.type,
        lastModified: Date.now()
      });

      // Re-enter zone to update signals/UI if needed, but since we return the result 
      // and the caller (App component) updates signals, we just return the value.
      // However, if we were updating signals HERE, we'd need run().
      // Since `isProcessing` is updated in `finally`, let's just return.

      return {
        file: compressedFile,
        originalSize: file.size,
        compressedSize: compressedFile.size,
        compressionRatio: (1 - (compressedFile.size / file.size)) * 100
      };
    } catch (error) {
      console.error('Compression failed:', error);
      throw error;
    } finally {
      // Ensure we update signal inside the zone
      this.ngZone.run(() => {
        this.isProcessing.set(false);
      });
    }
  }

  createObjectUrl(blob: Blob): string {
    return URL.createObjectURL(blob);
  }

  revokeObjectUrl(url: string): void {
    URL.revokeObjectURL(url);
  }

  private getNewFileName(originalName: string, targetType?: string): string {
    if (!targetType) return originalName;

    const namePart = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
    let extension = '';

    switch (targetType) {
      case 'image/jpeg': extension = 'jpg'; break;
      case 'image/png': extension = 'png'; break;
      case 'image/webp': extension = 'webp'; break;
      default: return originalName;
    }

    return `${namePart}.${extension}`;
  }
}
