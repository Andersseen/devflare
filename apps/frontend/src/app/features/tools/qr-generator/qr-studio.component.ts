import { Component, effect, signal, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as QRCode from 'qrcode';

@Component({
    selector: 'app-qr-studio',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
    <div class="h-full flex flex-col p-6 gap-6 bg-slate-50 dark:bg-slate-900 overflow-y-auto">
      <header>
        <h1 class="text-2xl font-bold text-slate-800 dark:text-slate-100">QR Code Studio</h1>
        <p class="text-slate-500 dark:text-slate-400">Generate custom QR codes for URLs, Text, or Wi-Fi networks.</p>
      </header>

      <div class="flex flex-col lg:flex-row gap-6 h-full">
        <!-- Controls Panel -->
        <div class="flex-1 flex flex-col gap-6 bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
          
          <!-- Mode Tabs -->
          <div class="flex p-1 bg-slate-100 dark:bg-slate-900 rounded-lg">
            <button 
              (click)="mode.set('text')"
              [class.bg-white]="mode() === 'text'"
              [class.dark:bg-slate-700]="mode() === 'text'"
              [class.shadow-sm]="mode() === 'text'"
              class="flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all duration-200 text-slate-600 dark:text-slate-300">
              Standard (URL/Text)
            </button>
            <button 
              (click)="mode.set('wifi')"
              [class.bg-white]="mode() === 'wifi'"
              [class.dark:bg-slate-700]="mode() === 'wifi'"
              [class.shadow-sm]="mode() === 'wifi'"
              class="flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all duration-200 text-slate-600 dark:text-slate-300">
              Wi-Fi Network
            </button>
          </div>

          <!-- Input Fields -->
          <div class="flex flex-col gap-4">
            @if (mode() === 'text') {
              <div class="flex flex-col gap-2">
                <label class="text-sm font-medium text-slate-700 dark:text-slate-300">Content</label>
                <textarea 
                  [ngModel]="text()" 
                  (ngModelChange)="text.set($event)"
                  rows="4"
                  class="w-full rounded-lg border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                  placeholder="https://example.com or any text"></textarea>
              </div>
            } @else {
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="flex flex-col gap-2">
                  <label class="text-sm font-medium text-slate-700 dark:text-slate-300">Network Name (SSID)</label>
                  <input 
                    type="text" 
                    [ngModel]="wifiSSID()" 
                    (ngModelChange)="wifiSSID.set($event)"
                    class="rounded-lg border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                    placeholder="MyHomeWiFi">
                </div>
                <div class="flex flex-col gap-2">
                  <label class="text-sm font-medium text-slate-700 dark:text-slate-300">Password</label>
                  <input 
                    type="text" 
                    [ngModel]="wifiPassword()" 
                    (ngModelChange)="wifiPassword.set($event)"
                    class="rounded-lg border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                    placeholder="SecretKey123">
                </div>
                <div class="flex flex-col gap-2">
                  <label class="text-sm font-medium text-slate-700 dark:text-slate-300">Encryption</label>
                  <select 
                    [ngModel]="wifiEncryption()" 
                    (ngModelChange)="wifiEncryption.set($event)"
                    class="rounded-lg border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-blue-500 focus:border-blue-500">
                    <option value="WPA">WPA/WPA2/WPA3</option>
                    <option value="WEP">WEP</option>
                    <option value="nopass">No Password</option>
                  </select>
                </div>
                <div class="flex flex-col gap-2 justify-end pb-3">
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      [ngModel]="wifiHidden()" 
                      (ngModelChange)="wifiHidden.set($event)"
                      class="rounded border-slate-300 text-blue-600 focus:ring-blue-500">
                    <span class="text-sm text-slate-700 dark:text-slate-300">Hidden Network</span>
                  </label>
                </div>
              </div>
            }
          </div>

          <div class="h-px bg-slate-200 dark:bg-slate-700 my-2"></div>

          <!-- Styling & Options -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
             <div class="flex flex-col gap-2">
              <label class="text-sm font-medium text-slate-700 dark:text-slate-300">Foreground Color</label>
              <div class="flex items-center gap-2">
                <input 
                  type="color" 
                  [ngModel]="fgColor()" 
                  (ngModelChange)="fgColor.set($event)"
                  class="h-10 w-16 p-1 rounded border border-slate-300 cursor-pointer">
                <span class="text-xs font-mono text-slate-500">{{fgColor()}}</span>
              </div>
            </div>
            <div class="flex flex-col gap-2">
              <label class="text-sm font-medium text-slate-700 dark:text-slate-300">Background Color</label>
              <div class="flex items-center gap-2">
                <input 
                  type="color" 
                  [ngModel]="bgColor()" 
                  (ngModelChange)="bgColor.set($event)"
                  class="h-10 w-16 p-1 rounded border border-slate-300 cursor-pointer">
                <span class="text-xs font-mono text-slate-500">{{bgColor()}}</span>
              </div>
            </div>
            <div class="flex flex-col gap-2">
              <label class="text-sm font-medium text-slate-700 dark:text-slate-300">Margin: {{margin()}}</label>
              <input 
                type="range" 
                min="0" 
                max="10" 
                step="1"
                [ngModel]="margin()" 
                (ngModelChange)="margin.set($event)"
                class="w-full accent-blue-600 cursor-pointer">
            </div>
          </div>
        </div>

        <!-- Preview Panel -->
        <div class="w-full lg:w-96 flex flex-col gap-6">
          <div class="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center gap-6 sticky top-6">
            <h2 class="text-lg font-semibold text-slate-800 dark:text-slate-100 self-start">Preview</h2>
            
            <div class="bg-white p-4 rounded-lg shadow-inner border border-slate-100 flex items-center justify-center min-h-[250px] w-full">
               <canvas #qrCanvas class="max-w-full"></canvas>
            </div>

            <button 
              (click)="downloadQR()"
              class="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm hover:shadow active:scale-[0.98]">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
              Download PNG
            </button>
            
            <p class="text-xs text-center text-slate-400 dark:text-slate-500 mt-2">
              Generated locally in your browser.
            </p>
          </div>
        </div>
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
export class QrStudioComponent {
    @ViewChild('qrCanvas') canvas!: ElementRef<HTMLCanvasElement>;

    // State Signals
    mode = signal<'text' | 'wifi'>('text');

    // Text Mode Data
    text = signal('https://example.com');

    // Wi-Fi Mode Data
    wifiSSID = signal('');
    wifiPassword = signal('');
    wifiEncryption = signal<'WPA' | 'WEP' | 'nopass'>('WPA');
    wifiHidden = signal(false);

    // Styling
    fgColor = signal('#000000');
    bgColor = signal('#ffffff');
    margin = signal(4);

    constructor() {
        effect(() => {
            // Track all dependencies
            const currentMode = this.mode();
            const txt = this.text();
            const ssid = this.wifiSSID();
            const pass = this.wifiPassword();
            const enc = this.wifiEncryption();
            const hidden = this.wifiHidden();
            const fg = this.fgColor();
            const bg = this.bgColor();
            const m = this.margin();

            // Trigger redraw
            // We wrap in setTimeout to ensure canvas is available if view is initializing
            setTimeout(() => {
                this.generateQR();
            });
        });
    }

    generateQR() {
        if (!this.canvas?.nativeElement) return;

        let content = '';
        if (this.mode() === 'text') {
            content = this.text() || ' ';
        } else {
            // Format: WIFI:T:WPA;S:MyNetwork;P:MyPassword;H:true;;
            const s = this.escapeWifi(this.wifiSSID());
            const p = this.escapeWifi(this.wifiPassword());
            const t = this.wifiEncryption();
            const h = this.wifiHidden();

            content = `WIFI:T:${t};S:${s};P:${p};H:${h};;`;
        }

        QRCode.toCanvas(this.canvas.nativeElement, content, {
            color: {
                dark: this.fgColor(),
                light: this.bgColor()
            },
            margin: this.margin(),
            width: 256
        }, (error: any) => {
            if (error) console.error(error);
        });
    }

    downloadQR() {
        if (!this.canvas?.nativeElement) return;

        const link = document.createElement('a');
        link.download = 'qrcode.png';
        link.href = this.canvas.nativeElement.toDataURL('image/png');
        link.click();
    }

    private escapeWifi(str: string): string {
        // Escape special characters in wifi string if needed
        // Common format avoids ; and : but usually raw string works for basic readers
        // Standard: \, ;, , and : should be escaped with \
        return str.replace(/([\\;,:])/g, '\\$1');
    }
}
