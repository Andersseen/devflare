import { Component, effect, ElementRef, signal, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { QrGeneratorService } from '@org/core';
import { LucideAngularModule } from 'lucide-angular';
import {
  VoltCard,
  VoltCardHeader,
  VoltCardTitle,
  VoltCardContent,
  VoltInput,
  VoltTextarea,
  VoltButton,
  VoltTabs,
  VoltTabsList,
  VoltTabsTrigger,
  VoltTabsContent,
  VoltSelect,
  VoltSelectItem,
  VoltSelectContent,
  VoltSwitch,
} from '@voltui/components';

@Component({
  selector: 'app-qr-generator-page',
  imports: [
    FormsModule,
    LucideAngularModule,
    VoltCard,
    VoltCardHeader,
    VoltCardTitle,
    VoltCardContent,
    VoltInput,
    VoltTextarea,
    VoltButton,
    VoltTabs,
    VoltTabsList,
    VoltTabsTrigger,
    VoltTabsContent,
    VoltSelect,
    VoltSelectItem,
    VoltSelectContent,
    VoltSwitch,
  ],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">QR Code Studio</h1>
        <p class="text-muted-foreground mt-1">Generate custom QR codes for URLs, text, or Wi-Fi networks</p>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <!-- Controls -->
        <div class="space-y-4">
          <volt-tabs [(value)]="mode">
            <volt-tabs-list>
              <volt-tabs-trigger value="text">URL / Text</volt-tabs-trigger>
              <volt-tabs-trigger value="wifi">Wi-Fi</volt-tabs-trigger>
            </volt-tabs-list>

            <volt-tabs-content value="text">
              <volt-card>
                <volt-card-content>
                  <volt-textarea
                    label="Content"
                    [(value)]="text"
                    placeholder="https://example.com or any text"
                    [rows]="4"
                  />
                </volt-card-content>
              </volt-card>
            </volt-tabs-content>

            <volt-tabs-content value="wifi">
              <volt-card>
                <volt-card-content class="space-y-4">
                  <volt-input label="Network Name (SSID)" [(value)]="wifiSSID" placeholder="MyHomeWiFi" />
                  <volt-input label="Password" [(value)]="wifiPassword" placeholder="SecretKey123" />

                  <div>
                    <label class="text-sm font-medium block mb-1">Encryption</label>
                    <select
                      [(ngModel)]="wifiEncryption"
                      class="w-full h-10 rounded-md border border-border bg-background px-3 text-sm"
                    >
                      <option value="WPA">WPA/WPA2/WPA3</option>
                      <option value="WEP">WEP</option>
                      <option value="nopass">No Password</option>
                    </select>
                  </div>

                  <div class="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="hiddenWifi"
                      [(ngModel)]="wifiHidden"
                      class="rounded border-border"
                    />
                    <label for="hiddenWifi" class="text-sm select-none">Hidden Network</label>
                  </div>
                </volt-card-content>
              </volt-card>
            </volt-tabs-content>
          </volt-tabs>

          <!-- Styling -->
          <volt-card>
            <volt-card-header>
              <volt-card-title>Styling</volt-card-title>
            </volt-card-header>
            <volt-card-content>
              <div class="grid grid-cols-3 gap-4">
                <div>
                  <label class="text-sm font-medium block mb-1">Foreground</label>
                  <input type="color" [(ngModel)]="fgColor" class="w-full h-10 rounded cursor-pointer">
                </div>
                <div>
                  <label class="text-sm font-medium block mb-1">Background</label>
                  <input type="color" [(ngModel)]="bgColor" class="w-full h-10 rounded cursor-pointer">
                </div>
                <div>
                  <label class="text-sm font-medium block mb-1">Margin: {{ margin() }}</label>
                  <input type="range" min="0" max="10" step="1" [value]="margin()" (change)="margin.set(+$any($event).target.value)" class="w-full">
                </div>
              </div>
            </volt-card-content>
          </volt-card>
        </div>

        <!-- Preview -->
        <div class="flex flex-col items-center gap-4">
          <volt-card class="w-full">
            <volt-card-header>
              <volt-card-title>Preview</volt-card-title>
            </volt-card-header>
            <volt-card-content class="flex flex-col items-center gap-4">
              <div class="bg-white p-4 rounded-lg border border-border flex items-center justify-center min-h-[280px] w-full">
                <canvas #qrCanvas class="max-w-full"></canvas>
              </div>
              <volt-button variant="solid" class="w-full" (click)="downloadQR()">
                <lucide-icon name="download" class="w-4 h-4 mr-2" />
                Download PNG
              </volt-button>
            </volt-card-content>
          </volt-card>
        </div>
      </div>
    </div>
  `,
})
export default class QrGeneratorPageComponent {
  @ViewChild('qrCanvas') canvas!: ElementRef<HTMLCanvasElement>;

  mode = signal<'text' | 'wifi'>('text');
  text = signal('https://devflare.app');
  wifiSSID = signal('');
  wifiPassword = signal('');
  wifiEncryption = signal<'WPA' | 'WEP' | 'nopass'>('WPA');
  wifiHidden = signal(false);
  fgColor = signal('#000000');
  bgColor = signal('#ffffff');
  margin = signal(4);

  private qrGeneratorService = inject(QrGeneratorService);

  constructor() {
    effect(() => {
      // Track all dependencies
      this.mode();
      this.text();
      this.wifiSSID();
      this.wifiPassword();
      this.wifiEncryption();
      this.wifiHidden();
      this.fgColor();
      this.bgColor();
      this.margin();

      setTimeout(() => this.generateQR());
    });
  }

  async generateQR() {
    if (!this.canvas?.nativeElement) return;

    let content = '';
    if (this.mode() === 'text') {
      content = this.text() || ' ';
    } else {
      content = this.qrGeneratorService.buildWifiContent(
        this.wifiSSID(),
        this.wifiPassword(),
        this.wifiEncryption(),
        this.wifiHidden()
      );
    }

    await this.qrGeneratorService.generateQR(this.canvas.nativeElement, {
      content,
      fgColor: this.fgColor(),
      bgColor: this.bgColor(),
      margin: this.margin(),
      width: 256,
    });
  }

  downloadQR() {
    if (!this.canvas?.nativeElement) return;
    this.qrGeneratorService.downloadQR(this.canvas.nativeElement);
  }
}
