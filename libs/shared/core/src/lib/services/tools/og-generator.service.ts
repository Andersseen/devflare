import { Injectable } from '@angular/core';
import { toPng } from 'html-to-image';

@Injectable({
  providedIn: 'root',
})
export class OgGenerator {
  async generatePng(element: HTMLElement): Promise<string> {
    return toPng(element, {
      pixelRatio: 1,
      cacheBust: true,
    });
  }

  downloadImage(dataUrl: string, filename = 'og-image.png'): void {
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    link.click();
  }
}
