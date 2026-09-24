import { Component, computed, input } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { findSecretHints } from '../tools/secret-hints';

/**
 * A quiet heads-up when pasted input looks like it holds credentials. Never
 * changes the input; only names what it found, masked.
 */
@Component({
  selector: 'app-secret-notice',
  imports: [LucideAngularModule],
  template: `
    @if (hints().length > 0) {
      <div
        role="status"
        class="flex gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
      >
        <lucide-icon
          name="lock"
          class="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
        />
        <div class="space-y-1">
          <p class="font-medium">This input looks like it contains secrets</p>
          <p class="text-muted-foreground">
            {{ summary() }}. It stays in this tab — nothing is sent anywhere —
            but think twice before sharing a screenshot.
          </p>
        </div>
      </div>
    }
  `,
})
export class SecretNoticeComponent {
  readonly text = input('');

  protected readonly hints = computed(() => findSecretHints(this.text()));

  protected readonly summary = computed(() => {
    const kinds = [...new Set(this.hints().map((hint) => hint.kind))];
    return kinds.join(', ');
  });
}
