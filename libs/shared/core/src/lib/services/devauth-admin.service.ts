import { Injectable, computed, signal } from '@angular/core';

/**
 * The browser half of dev-auth administration.
 *
 * Every call is same-origin against DevFlare's own `/api/admin/*`, which
 * forwards to the provider server-to-server. Nothing here holds a credential for
 * dev-auth and nothing here decides who is an administrator — `loadWhoami` asks,
 * and the page renders accordingly.
 */

export interface AdminClient {
  clientId: string;
  name: string;
  type: string;
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  skipConsent: boolean;
  enableEndSession: boolean;
  public: boolean;
  source: 'config' | 'managed';
  /** Config clients cannot be edited; the API says so rather than the UI guessing. */
  readOnly: boolean;
}

export interface GithubSettings {
  clientId: string;
  secretConfigured: boolean;
  enabled: boolean;
}

export interface ProviderSettingsView {
  github: GithubSettings;
  signup: { allowlist: string[]; restricted: boolean };
}

/** A secret is returned exactly once, when it is created or rotated. */
export interface IssuedSecret {
  clientId: string;
  clientSecret: string;
}

const BASE = '/api/admin';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers:
      init.body === undefined
        ? undefined
        : { 'Content-Type': 'application/json' },
    ...init,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    // The provider's message is specific and actionable ("redirect URI … is
    // already registered to …"), so it is shown rather than replaced.
    throw new Error(
      payload?.data?.error ??
        payload?.statusMessage ??
        payload?.error ??
        `Request failed with ${response.status}`,
    );
  }

  return payload as T;
}

@Injectable({ providedIn: 'root' })
export class DevAuthAdminService {
  private readonly clientsSignal = signal<AdminClient[]>([]);
  private readonly settingsSignal = signal<ProviderSettingsView | null>(null);
  private readonly isAdminSignal = signal<boolean | null>(null);
  private readonly unavailableSignal = signal(false);
  private readonly loadingSignal = signal(false);
  private readonly errorSignal = signal('');

  readonly clients = this.clientsSignal.asReadonly();
  readonly settings = this.settingsSignal.asReadonly();
  /** Null until asked, so the section can stay hidden rather than flicker. */
  readonly isAdmin = this.isAdminSignal.asReadonly();
  /** True when this server has no service token configured — not a rights problem. */
  readonly unavailable = this.unavailableSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  readonly configClients = computed(() =>
    this.clientsSignal().filter((client) => client.source === 'config'),
  );
  readonly managedClients = computed(() =>
    this.clientsSignal().filter((client) => client.source === 'managed'),
  );

  async loadWhoami(): Promise<boolean> {
    const result = await request<{ admin: boolean; reason?: string }>(
      '/whoami',
    );
    this.isAdminSignal.set(result.admin);
    this.unavailableSignal.set(result.reason === 'unavailable');
    return result.admin;
  }

  async loadAll(): Promise<void> {
    this.loadingSignal.set(true);
    this.errorSignal.set('');
    try {
      const [clients, settings] = await Promise.all([
        request<{ clients: AdminClient[] }>('/clients'),
        request<ProviderSettingsView>('/settings'),
      ]);
      this.clientsSignal.set(clients.clients);
      this.settingsSignal.set(settings);
    } catch (error) {
      this.errorSignal.set(messageOf(error));
    } finally {
      this.loadingSignal.set(false);
    }
  }

  createClient(input: {
    clientId: string;
    name: string;
    redirectUris: string[];
    skipConsent: boolean;
  }): Promise<IssuedSecret> {
    return request<IssuedSecret>('/clients', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  updateRedirectUris(
    clientId: string,
    redirectUris: string[],
  ): Promise<unknown> {
    return request(`/clients/${encodeURIComponent(clientId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ redirectUris }),
    });
  }

  rotateSecret(clientId: string): Promise<IssuedSecret> {
    return request<IssuedSecret>(
      `/clients/${encodeURIComponent(clientId)}/rotate-secret`,
      { method: 'POST' },
    );
  }

  deleteClient(clientId: string): Promise<unknown> {
    return request(`/clients/${encodeURIComponent(clientId)}`, {
      method: 'DELETE',
    });
  }

  saveGithub(input: {
    clientId?: string;
    clientSecret?: string;
    enabled?: boolean;
  }): Promise<unknown> {
    return request('/settings/github', {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  saveAllowlist(allowlist: string[]): Promise<unknown> {
    return request('/settings/allowlist', {
      method: 'PUT',
      body: JSON.stringify({ allowlist }),
    });
  }

  setError(message: string): void {
    this.errorSignal.set(message);
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong';
}
