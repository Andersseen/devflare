import { computed, inject, signal, type Signal } from '@angular/core';
import { ApiError } from './api';
import { RadarAccess } from './radar-access.service';

export type RemoteStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * One fetched resource as signals: `data`, `status`, `error`. Pages hold one
 * per endpoint and render all four states (loading, error, empty, ready).
 * A 401/403 is handed to RadarAccess so the shell can swap to sign-in or
 * "no access" instead of every page inventing its own handling.
 */
export class Remote<T> {
  readonly #access = inject(RadarAccess);
  readonly #data = signal<T | null>(null);
  readonly #status = signal<RemoteStatus>('idle');
  readonly #error = signal<string | null>(null);
  #generation = 0;

  readonly data: Signal<T | null> = this.#data.asReadonly();
  readonly status: Signal<RemoteStatus> = this.#status.asReadonly();
  readonly error: Signal<string | null> = this.#error.asReadonly();
  readonly loading = computed(
    () => this.#status() === 'loading' && this.#data() === null,
  );

  constructor(private readonly fetcher: () => Promise<T>) {}

  async load(): Promise<void> {
    const generation = ++this.#generation;
    this.#status.set('loading');
    this.#error.set(null);
    try {
      const value = await this.fetcher();
      if (generation !== this.#generation) return; // a newer load won
      this.#data.set(value);
      this.#status.set('ready');
    } catch (error) {
      if (generation !== this.#generation) return;
      if (this.#access.handleAccessError(error)) return;
      this.#error.set(
        error instanceof ApiError ? error.message : 'Something went wrong.',
      );
      this.#status.set('error');
    }
  }
}
