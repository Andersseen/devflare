import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BadgeComponent } from '@ui-components/badge.component';
import { ButtonComponent } from '@ui-components/button.component';
import { CardComponent } from '@ui-components/card.component';

@Component({
    selector: 'app-svg-optimizer',
    standalone: true,
    imports: [CommonModule, FormsModule, CardComponent, ButtonComponent, BadgeComponent],
    template: `
    <div class="h-full flex flex-col md:flex-row gap-6 p-4 md:p-8 overflow-hidden">
      
      <!-- Input (Left) -->
      <div class="w-full md:w-1/2 flex flex-col gap-4 min-h-0">
          <div class="flex items-center justify-between shrink-0">
              <div class="space-y-1">
                 <h2 class="text-2xl font-bold text-text">SVG Optimizer</h2>
                 <p class="text-sm text-text-muted">Minify SVG code locally.</p>
              </div>
          </div>

          <ui-card class="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div class="p-4 border-b border-border bg-secondary/30 flex justify-between items-center">
                  <span class="text-xs font-bold uppercase text-text-muted tracking-wider">Input</span>
                  <div class="flex items-center gap-2">
                      <span class="text-xs text-text-muted">{{ formatSize(inputSize()) }}</span>
                  </div>
              </div>
              <textarea 
                  [(ngModel)]="rawSvg"
				  (ngModelChange)="onInputChange($event)"
                  placeholder="Paste your SVG code here..."
                  class="flex-1 w-full p-4 bg-background text-text font-mono text-xs resize-none focus:outline-none border-b border-border"
              ></textarea>
               <div class="p-3 bg-secondary/10 flex justify-end">
                   <button (click)="pasteFromClipboard()" class="text-xs text-primary font-medium hover:underline">Paste from Clipboard</button>
               </div>
          </ui-card>
      </div>

      <!-- Output (Right) -->
      <div class="w-full md:w-1/2 flex flex-col gap-4 min-h-0">
          <!-- Stats Header -->
          <div class="flex items-center justify-end h-[52px] shrink-0 gap-3">
              @if (savings() > 0) {
                  <ui-badge variant="success" class="text-lg px-3 py-1">
                      -{{ savings() }}%
                  </ui-badge>
              }
              <div class="text-right">
                  <p class="text-xs text-text-muted uppercase">Optimized Size</p>
                  <p class="text-xl font-bold text-text">{{ formatSize(outputSize()) }}</p>
              </div>
          </div>

          <ui-card class="flex-1 flex flex-col min-h-0 overflow-hidden">
             
             <!-- Preview Tabs -->
             <div class="p-2 border-b border-border bg-secondary/30 flex gap-2">
                 <button 
                    (click)="activeTab.set('code')"
                    class="px-3 py-1.5 rounded text-xs font-medium transition-colors"
                    [class.bg-white]="activeTab() === 'code'"
                    [class.text-primary]="activeTab() === 'code'"
                    [class.shadow-sm]="activeTab() === 'code'"
                    [class.text-text-muted]="activeTab() !== 'code'"
                    [class.hover:text-text]="activeTab() !== 'code'"
                 >
                    Code
                 </button>
                 <button 
                    (click)="activeTab.set('preview')"
                    class="px-3 py-1.5 rounded text-xs font-medium transition-colors"
                    [class.bg-white]="activeTab() === 'preview'"
                    [class.text-primary]="activeTab() === 'preview'"
                    [class.shadow-sm]="activeTab() === 'preview'"
                    [class.text-text-muted]="activeTab() !== 'preview'"
                     [class.hover:text-text]="activeTab() !== 'preview'"
                 >
                    Preview
                 </button>
             </div>

             <!-- Content -->
             <div class="flex-1 relative overflow-hidden bg-background">
                 @if (activeTab() === 'code') {
                     <textarea 
                        readonly
                        [value]="optimizedSvg()"
                        class="w-full h-full p-4 bg-transparent text-text font-mono text-xs resize-none focus:outline-none"
                    ></textarea>
                 } @else {
                     <div class="w-full h-full flex items-center justify-center p-8 overflow-auto bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgZmlsbD0ibm9uZSI+PHBhdGggZmlsbD0iI3IyZTRlOCIgZD0iTTAgMGgxMHYxMEgwem0xMCAxMGgxMHYxMEgxMHoiLz48L3N2Zz4=')]">
                        <div class="max-w-full max-h-full shadow-lg bg-surface border border-border rounded" [innerHTML]="sanitizedSvg()"></div>
                     </div>
                 }
             </div>

             <!-- Footer Actions -->
             <div class="p-4 border-t border-border bg-secondary/10 flex justify-between items-center">
                 <span class="text-xs text-text-muted font-mono truncate max-w-[200px]">
                     {{ savingsBytes() }} bytes saved
                 </span>
                 <ui-button size="sm" (click)="copyToClipboard()">
                     <div class="flex items-center gap-2">
                         <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                           <path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                         </svg>
                         Copy Code
                     </div>
                 </ui-button>
             </div>
          </ui-card>
      </div>

    </div>
  `
})
export class SvgOptimizerComponent {
    rawSvg = signal('');
    optimizedSvg = signal('');
    activeTab = signal<'code' | 'preview'>('code');

    inputSize = computed(() => this.getByteLength(this.rawSvg()));
    outputSize = computed(() => this.getByteLength(this.optimizedSvg()));
    savingsBytes = computed(() => this.inputSize() - this.outputSize());
    savings = computed(() => {
        if (this.inputSize() === 0) return 0;
        return Math.round(((this.inputSize() - this.outputSize()) / this.inputSize()) * 100);
    });

    // Simple sanitization for display - in real app use DomSanitizer
    sanitizedSvg = computed(() => {
        // Create a SafeHtml-like behavior if needed, or primarily rely on innerHTML binding which Angular sanitizes by default
        return this.optimizedSvg();
    });

    onInputChange(val: string) {
        this.rawSvg.set(val);
        this.optimize(val);
    }

    optimize(svg: string) {
        if (!svg) {
            this.optimizedSvg.set('');
            return;
        }

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

        // 8. Trim
        res = res.trim();

        this.optimizedSvg.set(res);
    }

    async pasteFromClipboard() {
        try {
            const text = await navigator.clipboard.readText();
            this.rawSvg.set(text);
            this.optimize(text);
        } catch (err) {
            console.error('Failed to read clipboard', err);
        }
    }

    copyToClipboard() {
        navigator.clipboard.writeText(this.optimizedSvg()).then(() => {
            // Toast would go here
            console.log('Copied!');
        });
    }

    formatSize(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + ['B', 'KB', 'MB'][i];
    }

    private getByteLength(str: string) {
        return new TextEncoder().encode(str).length;
    }
}
