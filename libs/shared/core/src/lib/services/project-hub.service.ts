import { Injectable, computed, inject, signal } from '@angular/core';
import { CloudflareAccount } from './cloudflare-account.service';
import { Projects } from './projects.service';

/**
 * Loads what every project screen resolves against (spec 019): the caller's
 * saved projects and, when this account may read it, the Cloudflare inventory.
 *
 * The two load independently — a Cloudflare outage must not hide the projects,
 * and a project with no Cloudflare access still lists its links (as
 * unverifiable, with `unavailable` saying why).
 */
@Injectable({ providedIn: 'root' })
export class ProjectHub {
  readonly #projects = inject(Projects);
  readonly #cloud = inject(CloudflareAccount);

  readonly #loading = signal(false);
  readonly #error = signal('');

  readonly projects = this.#projects.list;
  readonly inventory = this.#cloud.inventory;
  readonly status = this.#cloud.status;
  readonly loading = this.#loading.asReadonly();
  /** A failure to load the projects themselves, or to ask about Cloudflare. */
  readonly error = this.#error.asReadonly();

  /**
   * Why there is no inventory to resolve against, or null when there is one.
   * Shown against every link instead of pretending the resource is fine.
   */
  readonly unavailable = computed((): string | null => {
    if (this.inventory()) return null;
    const status = this.status();
    if (!status) return 'Cloudflare has not been checked yet';
    switch (status.reason) {
      case 'not-admin':
        return 'The Cloudflare account is only visible to administrators';
      case 'unavailable':
        return 'The identity service is not configured, so Cloudflare cannot be read';
      case 'signed-out':
        return 'Signed out';
    }
    return status.configured
      ? 'The Cloudflare account could not be read'
      : 'No Cloudflare account is connected';
  });

  /** True when links can be verified and new ones made. */
  readonly canLink = computed(() => {
    const status = this.status();
    return Boolean(status?.admin && status.configured && this.inventory());
  });

  async load(refresh = false): Promise<void> {
    this.#loading.set(true);
    this.#error.set('');

    const projects = this.#projects.getProjects().catch((error: unknown) => {
      this.#error.set(messageOf(error, 'Could not load projects'));
    });

    try {
      const status = await this.#cloud.loadStatus();
      if (status.admin && status.configured) {
        await this.#cloud.loadInventory(refresh);
      }
    } catch (error: unknown) {
      this.#error.set(messageOf(error, 'Could not reach the server'));
    }

    await projects;
    this.#loading.set(false);
  }
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
