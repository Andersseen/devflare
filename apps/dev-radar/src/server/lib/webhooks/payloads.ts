import type {
  GhInstallation,
  GhPullRequest,
  GhRelease,
  GhWorkflowRun,
} from '../github/types';

/**
 * Webhook payload slices, with guards. GitHub's payloads are trusted only
 * after the HMAC check, but a shape this code does not expect (a new event
 * version, a hand-sent test) is ignored rather than crashing a handler.
 */

export interface WebhookRepository {
  id: number;
  name: string;
  full_name: string;
  html_url?: string;
  private?: boolean;
  archived?: boolean;
  default_branch?: string;
  owner?: { login?: string; name?: string };
}

interface Base {
  installation?: { id: number };
  repository?: WebhookRepository;
  sender?: { login: string };
}

export interface PushPayload extends Base {
  ref: string;
  after: string;
  deleted?: boolean;
  commits?: unknown[];
  head_commit?: {
    id: string;
    message?: string;
    timestamp?: string;
    url?: string;
    author?: { name?: string; username?: string };
  } | null;
  pusher?: { name?: string };
}

export interface PullRequestPayload extends Base {
  action: string;
  pull_request: GhPullRequest;
}

export interface WorkflowRunPayload extends Base {
  action: string;
  workflow_run: GhWorkflowRun;
}

export interface ReleasePayload extends Base {
  action: string;
  release: GhRelease;
}

export interface InstallationPayload extends Base {
  action: string;
  installation: GhInstallation;
}

export interface InstallationRepositoriesPayload extends Base {
  action: string;
  installation: GhInstallation;
  repositories_added?: { id: number; full_name: string }[];
  repositories_removed?: { id: number; full_name: string }[];
}

type WithRepository<T> = T & { repository: WebhookRepository };
export type PushEvent = WithRepository<PushPayload>;
export type PullRequestEvent = WithRepository<PullRequestPayload>;
export type WorkflowRunEvent = WithRepository<WorkflowRunPayload>;
export type ReleaseEvent = WithRepository<ReleasePayload>;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isNum = (v: unknown): v is number => typeof v === 'number';
const isStr = (v: unknown): v is string => typeof v === 'string';

export function hasRepository(
  p: unknown,
): p is Base & { repository: WebhookRepository } {
  return (
    isRecord(p) &&
    isRecord(p['repository']) &&
    isNum(p['repository']['id']) &&
    isStr(p['repository']['full_name']) &&
    isStr(p['repository']['name'])
  );
}

export function isPush(p: unknown): p is PushEvent {
  const r = p as unknown as Record<string, unknown>;
  return hasRepository(p) && isStr(r['ref']) && isStr(r['after']);
}

export function isPullRequest(p: unknown): p is PullRequestEvent {
  const r = p as unknown as Record<string, unknown>;
  return (
    hasRepository(p) &&
    isStr(r['action']) &&
    isRecord(r['pull_request']) &&
    isNum(r['pull_request']['id']) &&
    isRecord(r['pull_request']['base']) &&
    isRecord(r['pull_request']['head'])
  );
}

export function isWorkflowRun(p: unknown): p is WorkflowRunEvent {
  const r = p as unknown as Record<string, unknown>;
  return (
    hasRepository(p) &&
    isStr(r['action']) &&
    isRecord(r['workflow_run']) &&
    isNum(r['workflow_run']['id']) &&
    isStr(r['workflow_run']['head_sha'])
  );
}

export function isRelease(p: unknown): p is ReleaseEvent {
  const r = p as unknown as Record<string, unknown>;
  return (
    hasRepository(p) &&
    isStr(r['action']) &&
    isRecord(r['release']) &&
    isNum(r['release']['id']) &&
    isStr(r['release']['tag_name'])
  );
}

export function isInstallation(p: unknown): p is InstallationPayload {
  const r = p as unknown as Record<string, unknown>;
  return (
    isRecord(p) &&
    isStr(r['action']) &&
    isRecord(r['installation']) &&
    isNum(r['installation']['id'])
  );
}
