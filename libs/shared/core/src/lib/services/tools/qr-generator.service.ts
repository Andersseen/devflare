import { Injectable } from '@angular/core';
import * as QRCode from 'qrcode';

export interface QROptions {
  content: string;
  fgColor: string;
  bgColor: string;
  margin: number;
  width: number;
}

@Injectable({
  providedIn: 'root',
})
export class QrGeneratorService {
  generateQR(canvas: HTMLCanvasElement, options: QROptions): Promise<void> {
    return new Promise((resolve, reject) => {
      QRCode.toCanvas(
        canvas,
        options.content,
        {
          color: {
            dark: options.fgColor,
            light: options.bgColor,
          },
          margin: options.margin,
          width: options.width,
        },
        (error: any) => {
          if (error) reject(error);
          else resolve();
        }
      );
    });
  }

  downloadQR(canvas: HTMLCanvasElement, filename = 'qrcode.png'): void {
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  buildWifiContent(
    ssid: string,
    password: string,
    encryption: 'WPA' | 'WEP' | 'nopass',
    hidden: boolean
  ): string {
    const s = this.escapeWifi(ssid);
    const p = this.escapeWifi(password);
    return `WIFI:T:${encryption};S:${s};P:${p};H:${hidden};;`;
  }

  private escapeWifi(str: string): string {
    return str.replace(/([\\;,:])/g, '\\$1');
  }
}
