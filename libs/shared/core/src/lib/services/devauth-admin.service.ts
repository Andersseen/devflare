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
  /** Null for a config client — see ../../../../../apps/dev-auth/src/routes/admin-clients.ts. */
  disabled: boolean;
  scopes: string[] | null;
  createdAt: string | null;
  updatedAt: string | null;
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
  emailPassword: { enabled: boolean; requireEmailVerification: boolean };
  transactionalEmail: { configured: boolean };
  signup: { allowlist: string[]; restricted: boolean };
}

/** A secret is returned exactly once, when it is created or rotated. */
export interface IssuedSecret {
  clientId: string;
  clientSecret: string;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: string;
  updatedAt: string;
  banned: boolean;
  bannedAt: string | null;
  bannedReason: string | null;
  bannedBy: string | null;
  providers: string[];
  sessionCount: number;
}

export interface AdminSession {
  id: string;
  userId: string;
  userEmail: string | null;
  userName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
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
  private readonly usersSignal = signal<AdminUser[]>([]);
  private readonly sessionsSignal = signal<AdminSession[]>([]);
  private readonly isAdminSignal = signal<boolean | null>(null);
  private readonly unavailableSignal = signal(false);
  private readonly loadingSignal = signal(false);
  private readonly errorSignal = signal('');

  readonly clients = this.clientsSignal.asReadonly();
  readonly settings = this.settingsSignal.asReadonly();
  readonly users = this.usersSignal.asReadonly();
  readonly sessions = this.sessionsSignal.asReadonly();
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

  setClientDisabled(clientId: string, disabled: boolean): Promise<unknown> {
    return request(`/clients/${encodeURIComponent(clientId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ disabled }),
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

  async loadUsers(q?: string): Promise<void> {
    this.loadingSignal.set(true);
    this.errorSignal.set('');
    try {
      const suffix = q ? `?q=${encodeURIComponent(q)}` : '';
      const result = await request<{ users: AdminUser[] }>(`/users${suffix}`);
      this.usersSignal.set(result.users);
    } catch (error) {
      this.errorSignal.set(messageOf(error));
    } finally {
      this.loadingSignal.set(false);
    }
  }

  loadUserDetail(id: string): Promise<AdminUser> {
    return request<AdminUser>(`/users/${encodeURIComponent(id)}`);
  }

  banUser(id: string, reason?: string): Promise<unknown> {
    return request(`/users/${encodeURIComponent(id)}/ban`, {
      method: 'POST',
      body: JSON.stringify(reason ? { reason } : {}),
    });
  }

  unbanUser(id: string): Promise<unknown> {
    return request(`/users/${encodeURIComponent(id)}/unban`, {
      method: 'POST',
    });
  }

  async loadSessions(userId?: string): Promise<void> {
    this.loadingSignal.set(true);
    this.errorSignal.set('');
    try {
      const suffix = userId ? `?userId=${encodeURIComponent(userId)}` : '';
      const result = await request<{ sessions: AdminSession[] }>(
        `/sessions${suffix}`,
      );
      this.sessionsSignal.set(result.sessions);
    } catch (error) {
      this.errorSignal.set(messageOf(error));
    } finally {
      this.loadingSignal.set(false);
    }
  }

  revokeSession(id: string): Promise<unknown> {
    return request(`/sessions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  revokeUserSessions(userId: string): Promise<unknown> {
    return request(`/sessions/user/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });
  }

  setError(message: string): void {
    this.errorSignal.set(message);
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong';
}
