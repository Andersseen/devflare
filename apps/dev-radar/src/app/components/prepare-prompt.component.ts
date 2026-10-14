import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ApiError } from '../radar/api';
import { RadarApi } from '../radar/radar-api.service';

/**
 * Manual prompt preparation. The first attempt respects the CI gate; if CI is
 * not passing, the user is told why and may explicitly choose "Prepare anyway"
 * — the only way the gate is bypassed, and it is recorded on the prompt.
 */
@Component({
  selector: 'app-prepare-prompt',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LucideAngularModule],
  template: `
    <div class="space-y-3" data-testid="prepare-prompt">
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          [disabled]="busy()"
          (click)="prepare(false)"
          data-testid="prepare-button"
        >
          <lucide-icon
            [name]="busy() ? 'loader' : 'play'"
            class="h-4 w-4"
            [class.animate-spin]="busy()"
          />
          {{ busy() ? 'Preparing…' : 'Prepare prompt' }}
        </button>
        @if (blocked()) {
          <button
            type="button"
            class="h-9 rounded-md border border-border px-3 text-sm hover:bg-muted disabled:opacity-50"
            [disabled]="busy()"
            (click)="prepare(true)"
            data-testid="prepare-bypass"
          >
            Prepare anyway (bypass CI)
          </button>
        }
      </div>

      @if (blocked(); as reason) {
        <p
          class="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm"
          role="status"
          data-testid="prepare-blocked"
        >
          CI is not passing for the latest commit: {{ reason }} Preparing anyway
          is a manual bypass and is recorded on the prompt.
        </p>
      }
      @if (error(); as message) {
        <p
          class="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-300"
          role="alert"
          data-testid="prepare-error"
        >
          {{ message }}
        </p>
      }
      @if (promptId(); as id) {
        <p class="text-sm" role="status" data-testid="prepare-done">
          Prompt prepared.
          <a
            [routerLink]="['/prompts', id]"
            class="font-medium text-primary hover:underline"
            >Open it in the Prompt Inbox</a
          >
        </p>
      }
    </div>
  `,
})
export class PreparePromptComponent {
  readonly #api = inject(RadarApi);

  readonly repositoryId = input.required<number>();
  readonly prepared = output<string>();

  protected readonly busy = signal(false);
  protected readonly blocked = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly promptId = signal<string | null>(null);

  protected async prepare(bypassCi: boolean): Promise<void> {
    if (this.busy()) return; // a double click must not submit twice
    this.busy.set(true);
    this.error.set(null);
    this.promptId.set(null);
    if (!bypassCi) this.blocked.set(null);
    try {
      const result = await this.#api.preparePrompt(
        this.repositoryId(),
        bypassCi,
      );
      this.blocked.set(null);
      this.promptId.set(result.promptId);
      this.prepared.emit(result.promptId);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'ci_not_passing') {
        this.blocked.set(error.message);
      } else {
        this.error.set(
          error instanceof ApiError ? error.message : 'Something went wrong.',
        );
      }
    } finally {
      this.busy.set(false);
    }
  }
}
