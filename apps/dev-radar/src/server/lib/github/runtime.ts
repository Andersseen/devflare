import type { ConnectionDto } from '../../../shared/dto';
import { createGitHubApi, type GitHubApi } from './api';
import type { RequestBudget } from './client';
import { envVar, type RequestContext } from '../env';

/**
 * Resolves the GitHub App configuration from the Worker environment and says,
 * by name, what is missing. Secrets are only ever read here and handed to the
 * signing code; the DTO form (`connection`) carries names, never values.
 */

export const DEFAULT_REQUEST_BUDGET = 45;

export interface GitHubConfig {
  appId: string | undefined;
  slug: string | undefined;
  privateKey: string | undefined;
  webhookSecret: string | undefined;
  requestBudget: number;
  /** Only honored for a local fake (`http://localhost`/`127.0.0.1`) or https. */
  apiBaseUrl: string | undefined;
}

export function resolveGitHubConfig(context: RequestContext): GitHubConfig {
  const budget = Number(envVar(context, 'GITHUB_SYNC_REQUEST_BUDGET'));
  return {
    appId: envVar(context, 'GITHUB_APP_ID'),
    slug: envVar(context, 'GITHUB_APP_SLUG'),
    privateKey: envVar(context, 'GITHUB_APP_PRIVATE_KEY'),
    webhookSecret: envVar(context, 'GITHUB_WEBHOOK_SECRET'),
    requestBudget:
      Number.isInteger(budget) && budget > 0 ? budget : DEFAULT_REQUEST_BUDGET,
    apiBaseUrl: safeBaseUrl(envVar(context, 'GITHUB_API_BASE_URL')),
  };
}

/** https, or plain http to the local machine; anything else is ignored. */
export function safeBaseUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    const local = ['localhost', '127.0.0.1'].includes(url.hostname);
    if (url.protocol === 'https:' || (url.protocol === 'http:' && local)) {
      return url.origin;
    }
  } catch {
    // fall through
  }
  return undefined;
}

/** What the dashboard may know about the setup — names only. */
export function describeConnection(config: GitHubConfig): ConnectionDto {
  const missing: string[] = [];
  if (!config.appId) missing.push('GITHUB_APP_ID');
  if (!config.privateKey) missing.push('GITHUB_APP_PRIVATE_KEY');
  if (!config.webhookSecret) missing.push('GITHUB_WEBHOOK_SECRET');

  return {
    // Reading GitHub needs the App id + key; the webhook secret is a separate
    // switch so a half-configured setup still says exactly what is absent.
    configured: !!config.appId && !!config.privateKey,
    missing,
    installUrl: config.slug
      ? `https://github.com/apps/${encodeURIComponent(config.slug)}/installations/new`
      : null,
    webhookConfigured: !!config.webhookSecret,
  };
}

export interface RuntimeGitHub {
  api: GitHubApi;
  budget: RequestBudget;
}

/** null when the App is not configured. */
export function createRuntimeGitHub(
  config: GitHubConfig,
  fetchImpl: typeof fetch = fetch,
): RuntimeGitHub | null {
  if (!config.appId || !config.privateKey) return null;
  const budget: RequestBudget = { remaining: config.requestBudget };
  return {
    budget,
    api: createGitHubApi({
      appId: config.appId,
      privateKey: config.privateKey,
      fetch: fetchImpl,
      budget,
      baseUrl: config.apiBaseUrl,
    }),
  };
}
