import { Component, signal, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SvgOptimizerService } from '@org/core';
import { LucideAngularModule } from 'lucide-angular';
import {
  VoltCard,
  VoltCardHeader,
  VoltCardTitle,
  VoltCardContent,
  VoltTabs,
  VoltTabsList,
  VoltTabsTrigger,
  VoltTabsContent,
  VoltTextarea,
  VoltButton,
  VoltBadge,
} from '@voltui/components';

@Component({
  selector: 'app-svg-optimizer-page',
  imports: [
    FormsModule,
    LucideAngularModule,
    VoltCard,
    VoltCardHeader,
    VoltCardTitle,
    VoltCardContent,
    VoltTabs,
    VoltTabsList,
    VoltTabsTrigger,
    VoltTabsContent,
    VoltTextarea,
    VoltButton,
    VoltBadge,
  ],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">SVG Optimizer</h1>
        <p class="text-muted-foreground mt-1">Minify and clean up SVG code directly in your browser</p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Input -->
        <volt-card>
          <volt-card-header class="flex flex-row items-center justify-between">
            <volt-card-title>Input</volt-card-title>
            <span class="text-xs text-muted-foreground">{{ formatSize(inputSize()) }}</span>
          </volt-card-header>
          <volt-card-content>
            <volt-textarea
              [(value)]="rawSvg"
              (valueChange)="onInputChange($event)"
              placeholder="Paste your SVG code here..."
              class="font-mono text-xs"
              [rows]="12"
              resize="vertical"
            />
            <div class="flex justify-end mt-2">
              <button
                (click)="pasteFromClipboard()"
                class="text-xs text-primary font-medium hover:underline"
              >
                Paste from Clipboard
              </button>
            </div>
          </volt-card-content>
        </volt-card>

        <!-- Output -->
        <div class="space-y-4">
          <div class="flex items-center justify-end gap-3">
            @if (savings() > 0) {
              <volt-badge variant="solid">-{{ savings() }}%</volt-badge>
            }
            <div class="text-right">
              <p class="text-xs text-muted-foreground uppercase">Optimized Size</p>
              <p class="text-xl font-bold">{{ formatSize(outputSize()) }}</p>
            </div>
          </div>

          <volt-card>
            <volt-tabs [(value)]="activeTab">
              <volt-tabs-list>
                <volt-tabs-trigger value="code">Code</volt-tabs-trigger>
                <volt-tabs-trigger value="preview">Preview</volt-tabs-trigger>
              </volt-tabs-list>

              <volt-tabs-content value="code">
                <volt-textarea
                  [value]="optimizedSvg()"
                  readonly
                  class="font-mono text-xs"
                  [rows]="12"
                  resize="vertical"
                />
              </volt-tabs-content>

              <volt-tabs-content value="preview">
                <div
                  class="h-64 flex items-center justify-center rounded-lg border border-border overflow-auto"
                  style="background-image: url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgZmlsbD0ibm9uZSI+PHBhdGggZmlsbD0iI3IyZTRlOCIgZD0iTTAgMGgxMHYxMEgwem0xMCAxMGgxMHYxMEgxMHoiLz48L3N2Zz4=')"
                >
                  @if (optimizedSvg()) {
                    <div class="max-w-full max-h-full shadow-lg bg-card border border-border rounded p-4" [innerHTML]="optimizedSvg()"></div>
                  } @else {
                    <p class="text-muted-foreground text-sm">Paste SVG code to see preview</p>
                  }
                </div>
              </volt-tabs-content>
            </volt-tabs>

            <volt-card-content class="flex justify-between items-center pt-0">
              <span class="text-xs text-muted-foreground font-mono">
                {{ savingsBytes() }} bytes saved
              </span>
              <volt-button size="sm" variant="outline" (click)="copyToClipboard()">
                Copy Code
              </volt-button>
            </volt-card-content>
          </volt-card>
        </div>
      </div>
    </div>
  `,
})
export default class SvgOptimizerPageComponent {
  rawSvg = signal('');
  optimizedSvg = signal('');
  activeTab = signal('code');

  inputSize = computed(() => this.getByteLength(this.rawSvg()));
  outputSize = computed(() => this.getByteLength(this.optimizedSvg()));
  savingsBytes = computed(() => this.inputSize() - this.outputSize());
  savings = computed(() =>
    this.svgOptimizerService.getSavingsPercent(this.inputSize(), this.outputSize())
  );

  private svgOptimizerService = inject(SvgOptimizerService);

  onInputChange(val: string) {
    this.rawSvg.set(val);
    this.optimize(val);
  }

  optimize(svg: string) {
    this.optimizedSvg.set(this.svgOptimizerService.optimize(svg));
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
      console.log('Copied!');
    });
  }

  formatSize(bytes: number): string {
    return this.svgOptimizerService.formatSize(bytes);
  }

  private getByteLength(str: string) {
    return this.svgOptimizerService.getByteLength(str);
  }
}
