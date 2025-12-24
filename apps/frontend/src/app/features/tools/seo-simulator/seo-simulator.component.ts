import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
    selector: 'app-seo-simulator',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
    <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 overflow-y-auto">
      <header class="flex-none p-6 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <h1 class="text-2xl font-bold text-slate-800 dark:text-slate-100">SEO Simulator</h1>
        <p class="text-slate-500 dark:text-slate-400">Preview how your content appears on social media and search results.</p>
      </header>

      <div class="flex-1 flex flex-col lg:flex-row h-full overflow-hidden">
        
        <!-- Input Panel (Left) -->
        <div class="w-full lg:w-[450px] flex-none bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 overflow-y-auto p-6 space-y-6 z-10">
            
            <!-- Title Input -->
            <div class="space-y-2">
                <div class="flex justify-between">
                    <label class="block text-sm font-medium text-slate-700 dark:text-slate-300">Meta Title</label>
                    <span class="text-xs font-mono" [ngClass]="titleColor()">{{ title().length }} / 60</span>
                </div>
                <input 
                    type="text" 
                    [(ngModel)]="title" 
                    class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                    placeholder="Enter page title...">
                @if (title().length > 70) {
                    <p class="text-xs text-red-500">Google will likely truncate this title.</p>
                }
            </div>

            <!-- Description Input -->
            <div class="space-y-2">
                <div class="flex justify-between">
                    <label class="block text-sm font-medium text-slate-700 dark:text-slate-300">Meta Description</label>
                    <span class="text-xs font-mono" [ngClass]="descColor()">{{ description().length }} / 160</span>
                </div>
                <textarea 
                    rows="4" 
                    [(ngModel)]="description" 
                    class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all resize-none"
                    placeholder="Enter page description..."></textarea>
            </div>

            <!-- URL Input -->
            <div class="space-y-2">
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300">Canonical URL</label>
                <input 
                    type="url" 
                    [(ngModel)]="url" 
                    class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                    placeholder="https://example.com/page">
            </div>

            <!-- Image Input -->
            <div class="space-y-2">
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300">Social Image</label>
                
                @if (imageSrc()) {
                    <div class="relative group rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 mb-2">
                        <img [src]="imageSrc()" class="w-full h-40 object-cover bg-slate-100 dark:bg-slate-900">
                        <button 
                            (click)="removeImage()"
                            class="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                        </button>
                    </div>
                }

                <div 
                    (dragover)="$event.preventDefault()"
                    (drop)="onDrop($event)"
                    class="w-full border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-6 flex flex-col items-center justify-center text-slate-500 hover:border-indigo-500 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                    (click)="fileInput.click()">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mb-2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    <span class="text-sm">Click to upload or drag & drop</span>
                    <input #fileInput type="file" class="hidden" accept="image/*" (change)="onFileSelected($event)">
                </div>
            </div>

             <button 
                (click)="copyHtml()"
                class="w-full py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-medium rounded-lg transition-colors flex items-center justify-center gap-2 mt-auto">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/></svg>
                Copy Meta Tags
            </button>

        </div>

        <!-- Previews (Right) -->
        <div class="flex-1 bg-slate-100 dark:bg-slate-900/50 p-6 md:p-8 overflow-y-auto space-y-8">
            
            <!-- Google -->
            <div class="max-w-[600px] mx-auto">
                <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" class="text-slate-400"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
                    Google Search Result
                </h3>
                <div class="bg-white p-4 rounded-lg shadow-sm border border-slate-200 font-sans">
                     <div class="flex items-center gap-3 mb-1">
                         <div class="w-7 h-7 bg-slate-100 rounded-full flex items-center justify-center p-1">
                             @if(imageSrc()) { <img [src]="imageSrc()" class="w-full h-full object-cover rounded-full"> } 
                             @else { <div class="w-3 h-3 bg-indigo-500 rounded-full"></div> }
                         </div>
                         <div class="text-sm">
                             <div class="text-slate-800 font-medium truncate max-w-[200px]">{{ getDomain() }}</div>
                             <div class="text-slate-500 text-xs truncate max-w-[250px]">{{ url() }}</div>
                         </div>
                         <div class="ml-auto">
                             <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-slate-400"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                         </div>
                     </div>
                     <a href="#" class="block text-[#1a0dab] text-xl font-medium hover:underline truncate mb-1 leading-snug font-arial">
                         {{ title() || 'Page Title' }}
                     </a>
                     <div class="text-sm text-[#4d5156] leading-relaxed line-clamp-2 font-arial">
                         {{ description() || 'Page description will appear here in search results.' }}
                     </div>
                </div>
            </div>

            <!-- Twitter / X -->
            <div class="max-w-[500px] mx-auto">
                <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" class="text-slate-500"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                    Twitter / X Summary Card
                </h3>
                <div class="bg-white rounded-xl border border-slate-200 overflow-hidden font-sans cursor-pointer hover:bg-slate-50 transition-colors">
                    <div class="aspect-[2/1] bg-slate-100 flex items-center justify-center overflow-hidden border-b border-slate-100">
                        @if (imageSrc()) {
                            <img [src]="imageSrc()" class="w-full h-full object-cover">
                        } @else {
                            <div class="text-slate-400 text-sm">Large Image Preview</div>
                        }
                    </div>
                    <div class="p-4">
                        <div class="text-slate-500 text-xs uppercase mb-0.5 truncate">{{ getDomain().toUpperCase() }}</div>
                        <div class="text-slate-900 font-bold mb-1 truncate leading-tight">{{ title() || 'Page Title' }}</div>
                        <div class="text-slate-500 text-sm line-clamp-2 leading-snug">{{ description() || 'Description goes here.' }}</div>
                    </div>
                </div>
            </div>

            <!-- Facebook -->
             <div class="max-w-[520px] mx-auto">
                <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" class="text-slate-500"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                    Facebook / LinkedIn
                </h3>
                <div class="bg-[#F0F2F5] p-3 rounded-lg">
                    <div class="bg-white border border-slate-300 overflow-hidden cursor-pointer" style="border-radius: 0;">
                        <div class="aspect-[1.91/1] bg-slate-100 flex items-center justify-center overflow-hidden">
                            @if (imageSrc()) {
                                <img [src]="imageSrc()" class="w-full h-full object-cover">
                            } @else {
                                <div class="text-slate-400 text-sm">1200 x 630</div>
                            }
                        </div>
                        <div class="p-3 bg-[#F2F3F5] border-t border-slate-200">
                             <div class="text-[#606770] text-xs uppercase truncate mb-0.5">{{ getDomain().toUpperCase() }}</div>
                             <div class="text-[#1d2129] font-bold text-base font-sans truncate mb-0.5 leading-tight">{{ title() }}</div>
                             <div class="text-[#606770] text-sm line-clamp-1 leading-snug">{{ description() }}</div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Slack -->
             <div class="max-w-[500px] mx-auto">
                <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" class="text-slate-500"><path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52h-2.521zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.522 2.528 2.528 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/></svg>
                    Slack / Embed
                </h3>
                <div class="flex gap-3">
                    <div class="w-1 rounded-full bg-slate-200"></div>
                    <div class="flex-1">
                        <div class="flex gap-2 mb-1">
                            <span class="text-xs font-bold text-slate-700">DevFlare</span>
                            <span class="text-xs text-slate-400">APP</span>
                        </div>
                        <div class="text-blue-600 font-bold mb-1 hover:underline cursor-pointer">{{ title() }}</div>
                        <div class="text-slate-700 text-sm mb-2">{{ description() }}</div>
                        @if (imageSrc()) {
                            <img [src]="imageSrc()" class="w-[300px] h-auto rounded-lg border border-slate-200 block">
                        }
                    </div>
                </div>
            </div>

        </div>
      </div>
    </div>
  `
})
export class SeoSimulatorComponent {
    title = signal('');
    description = signal('');
    url = signal('https://example.com/blog/my-post');
    imageSrc = signal<string | null>(null);

    titleColor = computed(() => {
        const len = this.title().length;
        if (len === 0) return 'text-slate-400';
        if (len < 60) return 'text-emerald-500 font-medium';
        if (len <= 70) return 'text-amber-500 font-medium';
        return 'text-red-500 font-bold';
    });

    descColor = computed(() => {
        const len = this.description().length;
        if (len === 0) return 'text-slate-400';
        if (len < 160) return 'text-emerald-500 font-medium';
        return 'text-red-500 font-bold';
    });

    getDomain() {
        try {
            return new URL(this.url()).hostname;
        } catch {
            return 'example.com';
        }
    }

    onFileSelected(event: Event) {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files[0]) {
            this.handleFile(input.files[0]);
        }
    }

    onDrop(event: DragEvent) {
        event.preventDefault();
        if (event.dataTransfer?.files.length) {
            this.handleFile(event.dataTransfer.files[0]);
        }
    }

    handleFile(file: File) {
        const reader = new FileReader();
        reader.onload = (e) => {
            this.imageSrc.set(e.target?.result as string);
        };
        reader.readAsDataURL(file);
    }

    removeImage() {
        this.imageSrc.set(null);
    }

    copyHtml() {
        const tags = `
<title>${this.title()}</title>
<meta name="description" content="${this.description()}">
<link rel="canonical" href="${this.url()}">

<!-- Open Graph / Facebook -->
<meta property="og:type" content="website">
<meta property="og:url" content="${this.url()}">
<meta property="og:title" content="${this.title()}">
<meta property="og:description" content="${this.description()}">
<meta property="og:image" content="${this.imageSrc() ? 'YOUR_IMAGE_URL' : ''}">

<!-- Twitter -->
<meta property="twitter:card" content="summary_large_image">
<meta property="twitter:url" content="${this.url()}">
<meta property="twitter:title" content="${this.title()}">
<meta property="twitter:description" content="${this.description()}">
<meta property="twitter:image" content="${this.imageSrc() ? 'YOUR_IMAGE_URL' : ''}">
        `.trim();

        navigator.clipboard.writeText(tags);
        alert('Meta tags copied to clipboard!');
    }
}
