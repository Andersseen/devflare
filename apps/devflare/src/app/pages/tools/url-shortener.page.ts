import {
  Component,
  effect,
  ElementRef,
  signal,
  ViewChild,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UrlShortener, HistoryItem } from '@org/core';
import { LucideAngularModule } from 'lucide-angular';
import {
  VoltCard,
  VoltCardContent,
  VoltInput,
  VoltButton,
} from '@voltui/components';

@Component({
  selector: 'app-url-shortener-page',
  imports: [
    FormsModule,
    LucideAngularModule,
    VoltCard,
    VoltCardContent,
    VoltInput,
    VoltButton,
  ],
  template: `
    <div class="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">URL Shortener</h1>
        <p class="text-muted-foreground mt-1">
          Shorten long links and track them with custom aliases
        </p>
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
              <volt-button
                variant="solid"
                class="w-full"
                (click)="shorten()"
                [disabled]="isLoading() || !isValidUrl()"
              >
                @if (isLoading()) {
                  <lucide-icon
                    name="loader"
                    class="animate-spin w-4 h-4 mr-2"
                  />
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
          <volt-card-content
            class="flex flex-col md:flex-row gap-6 items-center"
          >
            <div class="bg-white p-2 rounded-xl border border-border shadow-sm">
              <canvas #qrCanvas width="120" height="120"></canvas>
            </div>
            <div class="flex-1 text-center md:text-left space-y-3">
              <div>
                <p class="text-sm text-muted-foreground mb-1">
                  Your Short Link
                </p>
                <h2 class="text-2xl font-bold text-primary truncate">
                  {{ result()?.shortUrl }}
                </h2>
              </div>
              <div
                class="flex items-center gap-3 justify-center md:justify-start"
              >
                <volt-button
                  size="sm"
                  variant="outline"
                  (click)="copy(result()!.shortUrl)"
                >
                  @if (copied()) {
                    <lucide-icon
                      name="check"
                      class="w-4 h-4 mr-1 text-green-500"
                    />
                    Copied
                  } @else {
                    <lucide-icon name="copy" class="w-4 h-4 mr-1" />
                    Copy
                  }
                </volt-button>
                <a
                  [href]="result()?.shortUrl"
                  target="_blank"
                  class="inline-flex"
                >
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
                      <th class="px-4 py-3 font-semibold text-muted-foreground">
                        Original URL
                      </th>
                      <th class="px-4 py-3 font-semibold text-muted-foreground">
                        Short Link
                      </th>
                      <th
                        class="px-4 py-3 font-semibold text-muted-foreground w-10"
                      ></th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-border">
                    @for (item of history(); track item.slug) {
                      <tr class="hover:bg-accent/30 transition-colors">
                        <td
                          class="px-4 py-3 text-muted-foreground max-w-[200px] truncate"
                          [title]="item.originalUrl"
                        >
                          {{ item.originalUrl }}
                        </td>
                        <td class="px-4 py-3 font-medium text-primary">
                          {{ item.shortUrl }}
                        </td>
                        <td class="px-4 py-3">
                          <button
                            (click)="copy(item.shortUrl)"
                            class="p-1.5 text-muted-foreground hover:text-primary transition-colors rounded"
                          >
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
export default class UrlShortenerPage {
  @ViewChild('qrCanvas') qrCanvas!: ElementRef<HTMLCanvasElement>;

  url = signal('');
  customSlug = signal('');
  isLoading = signal(false);
  error = signal<string | null>(null);
  #urlShortenerService = inject(UrlShortener);

  result = signal<{ shortUrl: string; slug: string } | null>(null);
  copied = signal(false);
  history = signal<HistoryItem[]>(this.#urlShortenerService.loadHistory());

  constructor() {
    effect(() => {
      this.#urlShortenerService.saveHistory(this.history());
    });
  }

  isValidUrl(): boolean {
    return this.#urlShortenerService.isValidUrl(this.url());
  }

  async shorten() {
    if (!this.isValidUrl()) return;
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const { shortUrl, slug } = this.#urlShortenerService.shorten(
        this.url(),
        this.customSlug(),
      );

      this.result.set({ shortUrl, slug });
      this.addToHistory(shortUrl, slug);

      setTimeout(() => this.generateQR(shortUrl), 0);
    } catch {
      this.error.set('Failed to shorten URL. Please try again.');
    } finally {
      this.isLoading.set(false);
    }
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
    this.#urlShortenerService.generateQR(this.qrCanvas.nativeElement, text);
  }

  copy(text: string) {
    navigator.clipboard.writeText(text);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }
}
