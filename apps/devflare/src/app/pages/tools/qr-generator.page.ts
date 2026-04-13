import { Component, signal, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import QRCode from 'qrcode';
import { CardComponent, ButtonComponent, InputComponent } from '@org/ui';

@Component({
  selector: 'app-qr-generator-page',
  imports: [FormsModule, CardComponent, ButtonComponent, InputComponent],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">QR Code Generator</h1>
        <p class="text-muted-foreground mt-1">Create QR codes for any URL or text</p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Input -->
        <ui-card title="Content">
          <div class="space-y-4 mt-4">
            <ui-input
              label="Text or URL"
              placeholder="https://example.com"
              [(value)]="text"
            />

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium mb-1">Foreground Color</label>
                <input 
                  type="color" 
                  [(ngModel)]="fgColor"
                  class="w-full h-10 rounded cursor-pointer"
                />
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Background Color</label>
                <input 
                  type="color" 
                  [(ngModel)]="bgColor"
                  class="w-full h-10 rounded cursor-pointer"
                />
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium mb-1">Size: {{ size() }}px</label>
              <input 
                type="range" 
                [(ngModel)]="size"
                min="100" 
                max="1000" 
                step="50"
                class="w-full"
              />
            </div>
          </div>
        </ui-card>

        <!-- Preview -->
        <ui-card title="QR Code">
          <div class="mt-4 flex flex-col items-center">
            @if (qrDataUrl()) {
              <img [src]="qrDataUrl()" [width]="size()" [height]="size()" alt="QR Code" />
              
              <div class="flex gap-2 mt-4">
                <ui-button (click)="download('png')">Download PNG</ui-button>
                <ui-button variant="secondary" (click)="download('svg')">Download SVG</ui-button>
              </div>
            } @else {
              <div class="w-64 h-64 bg-muted rounded-lg flex items-center justify-center">
                <p class="text-muted-foreground">Enter text to generate QR</p>
              </div>
            }
          </div>
        </ui-card>
      </div>
    </div>
  `,
})
export default class QrGeneratorPageComponent {
  text = signal('https://devflare.app');
  size = signal(300);
  fgColor = signal('#000000');
  bgColor = signal('#ffffff');
  qrDataUrl = signal('');

  constructor() {
    effect(() => {
      this.generateQR();
    });
  }

  async generateQR() {
    if (!this.text()) {
      this.qrDataUrl.set('');
      return;
    }

    try {
      const url = await QRCode.toDataURL(this.text(), {
        width: this.size(),
        color: {
          dark: this.fgColor(),
          light: this.bgColor(),
        },
      });
      this.qrDataUrl.set(url);
    } catch (err) {
      console.error('Failed to generate QR:', err);
    }
  }

  async download(format: 'png' | 'svg') {
    if (!this.text()) return;

    let dataUrl: string;
    
    if (format === 'svg') {
      dataUrl = await QRCode.toString(this.text(), {
        type: 'svg',
        color: {
          dark: this.fgColor(),
          light: this.bgColor(),
        },
      });
      const blob = new Blob([dataUrl], { type: 'image/svg+xml' });
      dataUrl = URL.createObjectURL(blob);
    } else {
      dataUrl = this.qrDataUrl();
    }

    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `qr-code.${format}`;
    a.click();
  }
}
