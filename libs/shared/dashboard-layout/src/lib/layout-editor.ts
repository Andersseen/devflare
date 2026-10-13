import { computed, signal } from '@angular/core';
import {
  emptyLayout,
  layoutsEqual,
  reconcileLayout,
  type DashboardLayout,
} from './layout';

export interface LayoutEditorOptions {
  /**
   * Persists the draft. Resolve to accept it, throw to keep editing. Resolving
   * to a layout adopts that (the server's version) instead of the draft.
   */
  save: (layout: DashboardLayout) => Promise<DashboardLayout | void>;
  /** Restores the product default on the server; resolves to the new stored layout. */
  reset: () => Promise<DashboardLayout>;
}

/**
 * Edit-mode state for one dashboard, as signals (spec 022).
 *
 * - `layout()` is what the page renders: the draft while editing, otherwise the
 *   saved layout reconciled with the items that exist right now.
 * - Edits go through `apply()` and touch only the draft; `cancel()` drops it.
 * - Saves are serialized: a second `save()` while one is in flight is ignored,
 *   so two quick clicks cannot interleave two writes.
 */
export class LayoutEditor {
  readonly #source = signal<DashboardLayout>(emptyLayout());
  readonly #available = signal<readonly string[]>([]);
  readonly #draft = signal<DashboardLayout | null>(null);
  readonly #saving = signal(false);
  readonly #error = signal<string | null>(null);

  readonly saved = computed(() =>
    reconcileLayout(this.#source(), this.#available()),
  );
  readonly editing = computed(() => this.#draft() !== null);
  readonly layout = computed(() => this.#draft() ?? this.saved());
  readonly dirty = computed(() => {
    const draft = this.#draft();
    return draft !== null && !layoutsEqual(draft, this.saved());
  });
  readonly saving = this.#saving.asReadonly();
  readonly error = this.#error.asReadonly();

  constructor(private readonly options: LayoutEditorOptions) {}

  /** The layout as stored (or the default when nothing is stored). */
  setSource(layout: DashboardLayout): void {
    this.#source.set(layout);
  }

  /** The ids of the items that exist right now. */
  setAvailable(ids: readonly string[]): void {
    this.#available.set(ids);
  }

  start(): void {
    this.#error.set(null);
    this.#draft.set(this.saved());
  }

  cancel(): void {
    if (this.#saving()) return;
    this.#draft.set(null);
    this.#error.set(null);
  }

  /** Applies a pure layout operation to the draft. No-op outside edit mode. */
  apply(change: (layout: DashboardLayout) => DashboardLayout): void {
    // Reconciled so a draft never holds an item that is not on the board.
    this.#draft.update((draft) =>
      draft ? reconcileLayout(change(draft), this.#available()) : draft,
    );
  }

  async save(): Promise<boolean> {
    const draft = this.#draft();
    if (!draft || this.#saving()) return false;
    this.#saving.set(true);
    this.#error.set(null);
    try {
      const stored = await this.options.save(draft);
      this.#source.set(stored || draft);
      this.#draft.set(null);
      return true;
    } catch (error) {
      this.#error.set(
        error instanceof Error ? error.message : 'Could not save the layout.',
      );
      return false;
    } finally {
      this.#saving.set(false);
    }
  }

  async reset(): Promise<boolean> {
    if (this.#saving()) return false;
    this.#saving.set(true);
    this.#error.set(null);
    try {
      this.#source.set(await this.options.reset());
      this.#draft.set(null);
      return true;
    } catch (error) {
      this.#error.set(
        error instanceof Error
          ? error.message
          : 'Could not restore the default layout.',
      );
      return false;
    } finally {
      this.#saving.set(false);
    }
  }
}
