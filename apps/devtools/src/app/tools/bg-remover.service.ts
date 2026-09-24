import { Injectable } from '@angular/core';
import { removeBackground } from '@imgly/background-removal';

@Injectable({
  providedIn: 'root',
})
export class BgRemover {
  async removeBackground(file: File): Promise<Blob> {
    return removeBackground(file);
  }

  downloadResult(blob: Blob, filename?: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'removed-bg-' + Date.now() + '.png';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }
}
