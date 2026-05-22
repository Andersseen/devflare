import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class SvgOptimizerService {
  optimize(svg: string): string {
    if (!svg) return '';

    let res = svg;

    // 1. Remove XML instruction
    res = res.replace(/<\?xml.*?>/gi, '');

    // 2. Remove comments
    res = res.replace(/<!--[\s\S]*?-->/g, '');

    // 3. Remove DOCTYPE
    res = res.replace(/<!DOCTYPE.*?>/gi, '');

    // 4. Collapse whitespace
    res = res.replace(/\s+/g, ' ');

    // 5. Remove spaces between tags
    res = res.replace(/>\s+</g, '><');

    // 6. Remove empty definitions
    res = res.replace(/<defs><\/defs>/g, '');

    // 7. Remove metadata
    res = res.replace(/<metadata>[\s\S]*?<\/metadata>/g, '');
    res = res.replace(/<title>[\s\S]*?<\/title>/g, '');
    res = res.replace(/<desc>[\s\S]*?<\/desc>/g, '');

    return res.trim();
  }

  formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + ['B', 'KB', 'MB'][i];
  }

  getByteLength(str: string): number {
    return new TextEncoder().encode(str).length;
  }

  getSavingsPercent(original: number, optimized: number): number {
    if (original === 0) return 0;
    return Math.round(((original - optimized) / original) * 100);
  }
}
