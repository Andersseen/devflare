import {
  GitHubApiError,
  GitHubRateLimitError,
  RequestBudgetExhaustedError,
} from './errors';

/**
 * A tiny, read-only GitHub REST transport: auth header, request budget,
 * retry of transient failures, rate-limit detection and Link-header
 * pagination. Everything above it (api.ts) is endpoint-specific.
 *
 * Runs on `fetch`, so the same code works in Workers, Node and tests (which
 * pass a fake `fetch` — no test ever reaches api.github.com).
 */

export interface RequestBudget {
  remaining: number;
}

export interface TransportOptions {
  fetch: typeof fetch;
  budget: RequestBudget;
  baseUrl?: string;
  /** Injectable so tests do not wait on backoff. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const API_VERSION = '2022-11-28';
const RETRYABLE = new Set([500, 502, 503, 504]);
const MAX_RETRIES = 2;

export interface Page<T> {
  data: T;
  next: string | null;
}

export class GitHubTransport {
  readonly #fetch: typeof fetch;
  readonly #budget: RequestBudget;
  readonly #baseUrl: string;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #now: () => number;

  constructor(options: TransportOptions) {
    this.#fetch = options.fetch;
    this.#budget = options.budget;
    this.#baseUrl = options.baseUrl ?? 'https://api.github.com';
    this.#sleep =
      options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.#now = options.now ?? Date.now;
  }

  /** One authenticated request. `url` may be a path or a pagination `next` URL. */
  async request<T>(
    url: string,
    init: { token: string; method?: 'GET' | 'POST'; body?: unknown },
  ): Promise<Page<T>> {
    const target = url.startsWith('http') ? url : `${this.#baseUrl}${url}`;
    // The path alone identifies the call in errors; query strings and tokens
    // never reach a message.
    const label = new URL(target).pathname;

    for (let attempt = 0; ; attempt++) {
      if (this.#budget.remaining <= 0) throw new RequestBudgetExhaustedError();
      this.#budget.remaining--;

      let response: Response;
      try {
        response = await this.#fetch(target, {
          method: init.method ?? 'GET',
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${init.token}`,
            'X-GitHub-Api-Version': API_VERSION,
            'User-Agent': 'DevRadar',
            ...(init.body !== undefined
              ? { 'Content-Type': 'application/json' }
              : {}),
          },
          body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        });
      } catch {
        if (attempt < MAX_RETRIES) {
          await this.#sleep(250 * 2 ** attempt);
          continue;
        }
        throw new GitHubApiError(0, label, 'Could not reach GitHub');
      }

      if (response.ok) {
        return {
          data: (response.status === 204
            ? undefined
            : await response.json()) as T,
          next: parseNextLink(response.headers.get('link')),
        };
      }

      const rateLimit = this.#rateLimited(response, label);
      if (rateLimit) throw rateLimit;

      if (RETRYABLE.has(response.status) && attempt < MAX_RETRIES) {
        await this.#sleep(250 * 2 ** attempt);
        continue;
      }

      throw new GitHubApiError(
        response.status,
        label,
        `GitHub answered ${response.status} for ${label}`,
      );
    }
  }

  /** Follows `rel="next"` up to `maxPages`; `pick` unwraps envelope responses. */
  async paginate<T, R = T[]>(
    path: string,
    options: {
      token: string;
      maxPages: number;
      pick?: (body: R) => T[];
    },
  ): Promise<{ items: T[]; truncated: boolean }> {
    const items: T[] = [];
    let url: string | null = path;
    let pages = 0;
    while (url && pages < options.maxPages) {
      const page: Page<R> = await this.request<R>(url, {
        token: options.token,
      });
      items.push(
        ...(options.pick ? options.pick(page.data) : (page.data as T[])),
      );
      url = page.next;
      pages++;
    }
    return { items, truncated: url !== null };
  }

  #rateLimited(response: Response, label: string): GitHubRateLimitError | null {
    const status = response.status;
    if (status !== 403 && status !== 429) return null;

    const remaining = response.headers.get('x-ratelimit-remaining');
    const retryAfter = response.headers.get('retry-after');
    const reset = response.headers.get('x-ratelimit-reset');

    // A plain 403 (missing permission) is not a rate limit.
    if (status === 403 && remaining !== '0' && retryAfter === null) return null;

    let resetAt: string | null = null;
    if (retryAfter !== null && Number.isFinite(Number(retryAfter))) {
      resetAt = new Date(this.#now() + Number(retryAfter) * 1000).toISOString();
    } else if (reset !== null && Number.isFinite(Number(reset))) {
      resetAt = new Date(Number(reset) * 1000).toISOString();
    }
    return new GitHubRateLimitError(label, resetAt);
  }
}

export function parseNextLink(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(',')) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}
