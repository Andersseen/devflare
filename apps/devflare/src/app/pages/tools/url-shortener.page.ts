import { Component, effect, ElementRef, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import * as QRCode from 'qrcode';
import { LucideAngularModule } from 'lucide-angular';
import {
  VoltCard,
  VoltCardHeader,
  VoltCardTitle,
  VoltCardContent,
  VoltInput,
  VoltButton,
  VoltBadge,
} from '@voltui/components';

interface HistoryItem {
  originalUrl: string;
  shortUrl: string;
  slug: string;
  createdAt: number;
}

@Component({
  selector: 'app-url-shortener-page',
  imports: [
    FormsModule,
    LucideAngularModule,
    VoltCard,
    VoltCardHeader,
    VoltCardTitle,
    VoltCardContent,
    VoltInput,
    VoltButton,
    VoltBadge,
  ],
  template: `
    <div class="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">URL Shortener</h1>
        <p class="text-muted-foreground mt-1">Shorten long links and track them with custom aliases</p>
      </div>

      <!-- Creation -->
      <volt-card>
        <volt-card-content class="space-y-4">
          <volt-input
            label="Long URL"
            type="url"
            placeholder="https://example.com/very/long/url..."
            [(value)]="url"
          />
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <volt-input
              label="Custom Alias (Optional)"
              placeholder="my-link"
              [(value)]="customSlug"
            />
            <div class="flex items-end">
              <volt-button variant="solid" class="w-full" (click)="shorten()" [disabled]="isLoading() || !isValidUrl()">
                @if (isLoading()) {
                  <lucide-icon name="loader" class="animate-spin w-4 h-4 mr-2" />
                  Processing...
                } @else {
                  <lucide-icon name="link" class="w-4 h-4 mr-2" />
                  Shorten URL
                }
              </volt-button>
            </div>
          </div>
          @if (error()) {
            <p class="text-sm text-red-500">{{ error() }}</p>
          }
        </volt-card-content>
      </volt-card>

      <!-- Result -->
      @if (result()) {
        <volt-card>
          <volt-card-content class="flex flex-col md:flex-row gap-6 items-center">
            <div class="bg-white p-2 rounded-xl border border-border shadow-sm">
              <canvas #qrCanvas width="120" height="120"></canvas>
            </div>
            <div class="flex-1 text-center md:text-left space-y-3">
              <div>
                <p class="text-sm text-muted-foreground mb-1">Your Short Link</p>
                <h2 class="text-2xl font-bold text-primary truncate">{{ result()?.shortUrl }}</h2>
              </div>
              <div class="flex items-center gap-3 justify-center md:justify-start">
                <volt-button size="sm" variant="outline" (click)="copy(result()!.shortUrl)">
                  @if (copied()) {
                    <lucide-icon name="check" class="w-4 h-4 mr-1 text-green-500" />
                    Copied
                  } @else {
                    <lucide-icon name="copy" class="w-4 h-4 mr-1" />
                    Copy
                  }
                </volt-button>
                <a [href]="result()?.shortUrl" target="_blank" class="inline-flex">
                  <volt-button size="sm" variant="ghost">
                    <lucide-icon name="external-link" class="w-4 h-4 mr-1" />
                    Visit
                  </volt-button>
                </a>
              </div>
            </div>
          </volt-card-content>
        </volt-card>
      }

      <!-- History -->
      @if (history().length > 0) {
        <div>
          <h3 class="text-lg font-bold mb-4">Recent Links</h3>
          <volt-card>
            <volt-card-content class="p-0">
              <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                  <thead class="bg-muted/50 border-b border-border">
                    <tr>
                      <th class="px-4 py-3 font-semibold text-muted-foreground">Original URL</th>
                      <th class="px-4 py-3 font-semibold text-muted-foreground">Short Link</th>
                      <th class="px-4 py-3 font-semibold text-muted-foreground w-10"></th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-border">
                    @for (item of history(); track item.slug) {
                      <tr class="hover:bg-accent/30 transition-colors">
                        <td class="px-4 py-3 text-muted-foreground max-w-[200px] truncate" [title]="item.originalUrl">
                          {{ item.originalUrl }}
                        </td>
                        <td class="px-4 py-3 font-medium text-primary">
                          {{ item.shortUrl }}
                        </td>
                        <td class="px-4 py-3">
                          <button (click)="copy(item.shortUrl)" class="p-1.5 text-muted-foreground hover:text-primary transition-colors rounded">
                            <lucide-icon name="copy" class="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </volt-card-content>
          </volt-card>
        </div>
      }
    </div>
  `,
})
export default class UrlShortenerPageComponent {
  @ViewChild('qrCanvas') qrCanvas!: ElementRef<HTMLCanvasElement>;

  url = signal('');
  customSlug = signal('');
  isLoading = signal(false);
  error = signal<string | null>(null);
  result = signal<{ shortUrl: string; slug: string } | null>(null);
  copied = signal(false);
  history = signal<HistoryItem[]>(this.loadHistory());

  constructor() {
    effect(() => {
      localStorage.setItem('shortener_history', JSON.stringify(this.history()));
    });
  }

  loadHistory(): HistoryItem[] {
    try {
      const stored = localStorage.getItem('shortener_history');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  isValidUrl(): boolean {
    try {
      new URL(this.url());
      return true;
    } catch {
      return false;
    }
  }

  async shorten() {
    if (!this.isValidUrl()) return;
    this.isLoading.set(true);
    this.error.set(null);

    try {
      // For now, generate a local short URL
      const slug = this.customSlug() || this.generateSlug();
      const shortUrl = `${window.location.origin}/s/${slug}`;

      this.result.set({ shortUrl, slug });
      this.addToHistory(shortUrl, slug);

      setTimeout(() => this.generateQR(shortUrl), 0);
    } catch (err) {
      this.error.set('Failed to shorten URL. Please try again.');
    } finally {
      this.isLoading.set(false);
    }
  }

  generateSlug(): string {
    return Math.random().toString(36).substring(2, 8);
  }

  addToHistory(shortUrl: string, slug: string) {
    const newItem: HistoryItem = {
      originalUrl: this.url(),
      shortUrl,
      slug,
      createdAt: Date.now(),
    };
    this.history.update((current) => [newItem, ...current].slice(0, 5));
    this.url.set('');
    this.customSlug.set('');
  }

  generateQR(text: string) {
    if (!this.qrCanvas?.nativeElement) return;
    QRCode.toCanvas(this.qrCanvas.nativeElement, text, {
      width: 120,
      margin: 1,
      color: { dark: '#4F46E5', light: '#FFFFFF' },
    }, (err) => {
      if (err) console.error(err);
    });
  }

  copy(text: string) {
    navigator.clipboard.writeText(text);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }
}
