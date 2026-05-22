import { Injectable } from '@angular/core';
import * as QRCode from 'qrcode';

export interface HistoryItem {
  originalUrl: string;
  shortUrl: string;
  slug: string;
  createdAt: number;
}

const STORAGE_KEY = 'shortener_history';

@Injectable({
  providedIn: 'root',
})
export class UrlShortener {
  generateSlug(): string {
    return Math.random().toString(36).substring(2, 8);
  }

  shorten(url: string, customSlug?: string): { shortUrl: string; slug: string } {
    const slug = customSlug || this.generateSlug();
    const shortUrl = `${window.location.origin}/s/${slug}`;
    return { shortUrl, slug };
  }

  loadHistory(): HistoryItem[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  saveHistory(history: HistoryItem[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  }

  isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  generateQR(canvas: HTMLCanvasElement, text: string): void {
    QRCode.toCanvas(
      canvas,
      text,
      { width: 120, margin: 1, color: { dark: '#4F46E5', light: '#FFFFFF' } },
      (err) => {
        if (err) console.error(err);
      }
    );
  }
}
