import { Injectable, signal } from '@angular/core';

/**
 * The browser half of the Cloud section.
 *
 * Every call is same-origin against DevFlare's own `/api/v1/cloud/*`, which
 * holds the account credential and talks to Cloudflare server-to-server. No
 * token, account id or upstream URL ever reaches this file — that is the whole
 * point of the arrangement (see apps/devflare/src/server/lib/cloudflare.ts).
 */

export type CloudStatusReason =
  | 'ok'
  | 'signed-out'
  | 'not-admin'
  | 'unavailable';

export interface CloudStatus {
  admin: boolean;
  /** Whether an API token is wired up. False means "connect", not "broken". */
  configured: boolean;
  reason: CloudStatusReason;
}

export interface CloudWorker {
  name: string;
  createdOn: string;
  modifiedOn: string;
  domains: string[];
}

export interface CloudDeployment {
  id: string;
  shortId: string;
  url: string;
  environment: string;
  createdOn: string;
  status: string;
  stage: string;
  branch: string | null;
  commit: string | null;
  commitMessage: string | null;
}

export interface CloudPagesProject {
  name: string;
  subdomain: string;
  domains: string[];
  productionBranch: string;
  createdOn: string;
  repo: string | null;
  latestDeployment: CloudDeployment | null;
}

const BASE = '/api/v1/cloud';

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
    // Cloudflare's own message ("Insufficient permissions (Cloudflare error
    // 10001)") tells the owner exactly which scope to add, so it is shown
    // rather than replaced with something generic.
    throw new Error(
      payload?.data?.error ??
        payload?.statusMessage ??
        payload?.error ??
        `Request failed with ${response.status}`,
    );
  }

  return payload as T;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong';
}

// ---------------------------------------------------------------------------
// Presentation helpers — pure, and the part worth testing.
// ---------------------------------------------------------------------------

export type DeploymentTone = 'success' | 'failure' | 'progress' | 'idle';

/**
 * Cloudflare reports a stage status, not a colour. Anything unrecognised stays
 * neutral: a new stage name should read as "unknown", never as a green tick.
 */
export function deploymentTone(status: string): DeploymentTone {
  switch (status) {
    case 'success':
      return 'success';
    case 'failure':
    case 'canceled':
    case 'skipped':
      return 'failure';
    case 'active':
    case 'building':
    case 'queued':
    case 'initializing':
      return 'progress';
    default:
      return 'idle';
  }
}

/** Coarse on purpose: for a deploy list, "3h ago" beats a timestamp. */
export function formatRelative(iso: string | null, now = Date.now()): string {
  if (!iso) return '—';

  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';

  const seconds = Math.round((now - then) / 1000);
  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  return new Date(iso).toLocaleDateString();
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null || Number.isNaN(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;

  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

@Injectable({ providedIn: 'root' })
export class CloudflareAccount {
  private readonly statusSignal = signal<CloudStatus | null>(null);
  private readonly workersSignal = signal<CloudWorker[]>([]);
  private readonly projectsSignal = signal<CloudPagesProject[]>([]);
  private readonly loadingSignal = signal(false);
  private readonly errorSignal = signal('');

  /** Null until asked, so the shell can stay quiet rather than flicker. */
  readonly status = this.statusSignal.asReadonly();
  readonly workers = this.workersSignal.asReadonly();
  readonly projects = this.projectsSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  async loadStatus(): Promise<CloudStatus> {
    const status = await request<CloudStatus>('/status');
    this.statusSignal.set(status);
    return status;
  }

  /**
   * Workers and Pages are fetched together because the overview shows both, and
   * separately from storage because that page is reached on its own.
   */
  async loadOverview(refresh = false): Promise<void> {
    this.loadingSignal.set(true);
    this.errorSignal.set('');

    const query = refresh ? '?refresh=1' : '';

    try {
      const [workers, pages] = await Promise.all([
        request<{ workers: CloudWorker[] }>(`/workers${query}`),
        request<{ projects: CloudPagesProject[] }>(`/pages${query}`),
      ]);
      this.workersSignal.set(workers.workers);
      this.projectsSignal.set(pages.projects);
    } catch (error) {
      this.errorSignal.set(messageOf(error));
    } finally {
      this.loadingSignal.set(false);
    }
  }
}
