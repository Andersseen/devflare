import { Injectable, signal } from '@angular/core';
import type { DashboardLayout } from '@org/dashboard-layout/logic';

/** One user-edit of a built-in (or user-defined) discovery identity. */
export interface DiscoveryIdentityOverride {
  slug: string;
  name: string;
  aliases: string[];
  removed: boolean;
}

interface LayoutResponse {
  layout: DashboardLayout;
  customized: boolean;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/v1/dashboard${path}`, {
    credentials: 'include',
    headers:
      init.body === undefined
        ? undefined
        : { 'Content-Type': 'application/json' },
    ...init,
  });
  const text = await response.text();
  let payload: { statusMessage?: string } | null = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw new Error(
      payload?.statusMessage ?? `Request failed with ${response.status}`,
    );
  }
  return payload as T;
}

/**
 * The signed-in user's saved dashboard customization (spec 022): the visual
 * layout and their edits to the discovery identities. D1 is the source of
 * truth; nothing is kept in browser storage. Presentation only — project
 * resource ownership is `Projects`, not this.
 */
@Injectable({ providedIn: 'root' })
export class DashboardCustomization {
  readonly #layout = signal<DashboardLayout | null>(null);
  readonly #customized = signal(false);
  readonly #identities = signal<DiscoveryIdentityOverride[] | null>(null);

  /** Null until loaded. An untouched account loads an empty layout. */
  readonly layout = this.#layout.asReadonly();
  readonly customized = this.#customized.asReadonly();
  readonly identities = this.#identities.asReadonly();

  async load(): Promise<void> {
    const [layout, identities] = await Promise.all([
      request<LayoutResponse>(''),
      request<{ identities: DiscoveryIdentityOverride[] }>('/identities'),
    ]);
    this.#adopt(layout);
    this.#identities.set(identities.identities);
  }

  async saveLayout(layout: DashboardLayout): Promise<DashboardLayout> {
    const stored = await request<LayoutResponse>('', {
      method: 'PUT',
      body: JSON.stringify(layout),
    });
    this.#adopt(stored);
    return stored.layout;
  }

  async resetLayout(): Promise<DashboardLayout> {
    const stored = await request<LayoutResponse>('', { method: 'DELETE' });
    this.#adopt(stored);
    return stored.layout;
  }

  async saveIdentities(overrides: DiscoveryIdentityOverride[]): Promise<void> {
    const stored = await request<{ identities: DiscoveryIdentityOverride[] }>(
      '/identities',
      { method: 'PUT', body: JSON.stringify({ identities: overrides }) },
    );
    this.#identities.set(stored.identities);
  }

  async resetIdentities(): Promise<void> {
    await request('/identities', { method: 'DELETE' });
    this.#identities.set([]);
  }

  #adopt(response: LayoutResponse): void {
    this.#layout.set(response.layout);
    this.#customized.set(response.customized);
  }
}
