import { Injectable } from '@angular/core';
import ColorThief from 'colorthief';

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

export interface ExtractedColor {
  hex: string;
  rgb: [number, number, number];
}

@Injectable({
  providedIn: 'root',
})
export class Palette {
  #colorThief = new ColorThief();

  extractColors(img: HTMLImageElement, count = 5): ExtractedColor[] {
    const palette = this.#colorThief.getPalette(img, count || 5);
    return palette.map((rgb: number[]) => ({
      rgb: [rgb[0], rgb[1], rgb[2]] as [number, number, number],
      hex: this.rgbToHex(rgb[0], rgb[1], rgb[2]),
    }));
  }

  rgbToHex(r: number, g: number, b: number): string {
    return (
      '#' +
      ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()
    );
  }

  createCinematicImage(
    img: HTMLImageElement,
    colors: ExtractedColor[],
  ): string {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    const stripHeight = Math.round(img.naturalHeight * 0.2);
    const totalHeight = img.naturalHeight + stripHeight;

    canvas.width = img.naturalWidth;
    canvas.height = totalHeight;

    ctx.drawImage(img, 0, 0);

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

    return canvas.toDataURL('image/png');
  }
}
