import { Component, input, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

/** Copies a value to the clipboard; the clipboard is local, nothing is sent. */
@Component({
  selector: 'app-copy-button',
  imports: [LucideAngularModule],
  template: `
    <button
      type="button"
      (click)="copy()"
      [disabled]="!value()"
      class="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
    >
      <lucide-icon [name]="copied() ? 'check' : 'copy'" class="h-3.5 w-3.5" />
      {{ copied() ? 'Copied' : label() }}
    </button>
  `,
})
export class CopyButtonComponent {
  readonly value = input('');
  readonly label = input('Copy');
  protected readonly copied = signal(false);

  protected async copy(): Promise<void> {
    if (typeof navigator === 'undefined' || !this.value()) return;
    await navigator.clipboard.writeText(this.value());
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 1500);
  }
}
