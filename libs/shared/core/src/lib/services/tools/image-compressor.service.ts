import { Injectable } from '@angular/core';
import imageCompression from 'browser-image-compression';

export interface CompressionOptions {
  quality: number; // 0-100
  maxWidth?: number;
  format: string; // image/jpeg, image/png, image/webp
}

@Injectable({
  providedIn: 'root',
})
export class ImageCompressor {
  async compress(file: File, options: CompressionOptions): Promise<File> {
    const compressOptions = {
      maxSizeMB: 100,
      useWebWorker: true,
      fileType: options.format,
      initialQuality: options.quality / 100,
      ...(options.maxWidth && options.maxWidth > 0
        ? { maxWidthOrHeight: options.maxWidth }
        : {}),
    };
    return imageCompression(file, compressOptions);
  }

  formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  getSavingsPercent(original: number, compressed: number): number {
    if (!original || !compressed) return 0;
    return Math.round((1 - compressed / original) * 100);
  }
}
