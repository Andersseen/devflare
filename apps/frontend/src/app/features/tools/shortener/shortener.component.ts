import { Component, ElementRef, ViewChild, signal, effect, afterNextRender } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UrlShortenerService, ShortenResponse } from '@core-services/url-shortener.service';
import QRCode from 'qrcode';

interface HistoryItem {
    originalUrl: string;
    shortUrl: string;
    slug: string;
    createdAt: number;
}

@Component({
    selector: 'app-shortener',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
    <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 overflow-y-auto">
      <header class="flex-none p-6 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <h1 class="text-2xl font-bold text-slate-800 dark:text-slate-100">URL Shortener</h1>
        <p class="text-slate-500 dark:text-slate-400">Shorten long links and track them.</p>
      </header>

      <div class="flex-1 p-6 flex flex-col items-center gap-8">
        
        <!-- Creation Card -->
        <div class="w-full max-w-2xl bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 md:p-8">
            <div class="space-y-6">
                <div>
                    <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Long URL <span class="text-red-500">*</span></label>
                    <input 
                        type="url" 
                        [(ngModel)]="url" 
                        placeholder="https://example.com/very/long/url..."
                        class="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all">
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Custom Alias <span class="text-slate-400 font-normal">(Optional)</span></label>
                        <div class="relative">
                            <span class="absolute left-4 top-3 text-slate-400">/</span>
                            <input 
                                type="text" 
                                [(ngModel)]="customSlug" 
                                placeholder="my-link"
                                class="w-full pl-8 pr-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all">
                        </div>
                    </div>
                    <div class="flex items-end">
                        <button 
                            (click)="shorten()"
                            [disabled]="isLoading() || !isValidUrl()"
                            class="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm shadow-indigo-500/20">
                            @if (isLoading()) {
                                <svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                Processing...
                            } @else {
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                                Shorten URL
                            }
                        </button>
                    </div>
                </div>
                
                @if (error()) {
                    <div class="p-3 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        {{ error() }}
                    </div>
                }
            </div>
        </div>

        <!-- Result Section -->
        @if (result()) {
             <div class="w-full max-w-2xl bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-indigo-100 dark:border-indigo-900/50 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div class="p-6 md:p-8 flex flex-col md:flex-row gap-8 items-center">
                    
                    <!-- QR Code -->
                    <div class="flex-none bg-white p-2 rounded-xl border border-slate-100 shadow-sm">
                        <canvas #qrCanvas width="120" height="120"></canvas>
                    </div>

                    <!-- Link Info -->
                    <div class="flex-1 w-full text-center md:text-left space-y-4">
                        <div>
                            <p class="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Your Short Link</p>
                            <h2 class="text-2xl md:text-3xl font-bold text-indigo-600 dark:text-indigo-400 truncate tracking-tight">{{ result()?.shortUrl }}</h2>
                        </div>
                        
                        <div class="flex items-center gap-3 justify-center md:justify-start">
                             <button 
                                (click)="copy(result()!.shortUrl)"
                                class="flex-1 md:flex-none px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
                                @if (copied()) {
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-500"><polyline points="20 6 9 17 4 12"/></svg>
                                    Copied
                                } @else {
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                                    Copy
                                }
                            </button>
                            <a 
                                [href]="result()?.shortUrl" 
                                target="_blank"
                                class="flex-1 md:flex-none px-4 py-2 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                Visit
                            </a>
                        </div>
                    </div>

                </div>
             </div>
        }

        <!-- Recent History -->
        @if (history().length > 0) {
            <div class="w-full max-w-2xl mt-4">
                <h3 class="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 px-1">Recent Links</h3>
                <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div class="overflow-x-auto">
                        <table class="w-full text-left">
                            <thead class="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-100 dark:border-slate-700">
                                <tr>
                                    <th class="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Original URL</th>
                                    <th class="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Short Link</th>
                                    <th class="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-10">Action</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100 dark:divide-slate-700">
                                @for (item of history(); track item.slug) {
                                    <tr class="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                                        <td class="px-6 py-4 text-sm text-slate-600 dark:text-slate-300 max-w-[200px] truncate" [title]="item.originalUrl">
                                            {{ item.originalUrl }}
                                        </td>
                                        <td class="px-6 py-4 text-sm font-medium text-indigo-600 dark:text-indigo-400">
                                            {{ item.shortUrl }}
                                        </td>
                                        <td class="px-6 py-4 text-sm">
                                            <button 
                                                (click)="copy(item.shortUrl)"
                                                class="p-2 text-slate-400 hover:text-indigo-600 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-600"
                                                title="Copy">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                                            </button>
                                        </td>
                                    </tr>
                                }
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        }
      </div>
    </div>
  `,
    styles: [`
    :host {
      display: block;
      height: 100%;
    }
  `]
})
export class ShortenerComponent {
    url = signal('');
    customSlug = signal('');
    isLoading = signal(false);
    error = signal<string | null>(null);
    result = signal<ShortenResponse | null>(null);
    copied = signal(false);

    // Initialize history from localStorage if available
    history = signal<HistoryItem[]>(this.loadHistory());

    @ViewChild('qrCanvas') qrCanvas!: ElementRef<HTMLCanvasElement>;

    constructor(private shortenerService: UrlShortenerService) {
        afterNextRender(() => {
            if (this.result()) {
                this.generateQR(this.result()!.shortUrl);
            }
        });

        // Persist history effect
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

    shorten() {
        if (!this.isValidUrl()) return;

        this.isLoading.set(true);
        this.error.set(null);
        this.result.set(null);

        this.shortenerService.shortenUrl(this.url(), this.customSlug())
            .subscribe({
                next: (response) => {
                    this.result.set(response);
                    this.addToHistory(response);
                    this.isLoading.set(false);
                    // Allow DOM to update then draw QR
                    setTimeout(() => this.generateQR(response.shortUrl), 0);
                },
                error: (err) => {
                    console.error(err);
                    this.error.set('Failed to shorten URL. Please try again.');
                    this.isLoading.set(false);
                }
            });
    }

    addToHistory(response: ShortenResponse) {
        const newItem: HistoryItem = {
            originalUrl: this.url(),
            shortUrl: response.shortUrl,
            slug: response.slug,
            createdAt: Date.now()
        };

        this.history.update(current => [newItem, ...current].slice(0, 5));

        // Reset inputs
        this.url.set('');
        this.customSlug.set('');
    }

    generateQR(text: string) {
        if (!this.qrCanvas?.nativeElement) return;

        QRCode.toCanvas(this.qrCanvas.nativeElement, text, {
            width: 120,
            margin: 1,
            color: {
                dark: '#4F46E5', // Indigo-600
                light: '#FFFFFF'
            }
        }, (error) => {
            if (error) console.error('QR Generation Error:', error);
        });
    }

    copy(text: string) {
        navigator.clipboard.writeText(text);
        this.copied.set(true);
        setTimeout(() => this.copied.set(false), 2000);
    }
}
