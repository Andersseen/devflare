import {
  LIMITS,
  parseChatGptUrl,
  type CiPolicy,
  type PromptStatus,
} from '../../../shared/automation';
import type { RuleInput } from '../store/automation';

/** Request validation for the automation API (spec 023). Pure and h3-free. */

export class ValidationError extends Error {}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function integerIn(
  value: unknown,
  field: string,
  range: { min: number; max: number },
): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < range.min ||
    value > range.max
  ) {
    throw new ValidationError(
      `${field} must be a whole number from ${range.min} to ${range.max}`,
    );
  }
  return value;
}

/** A GitHub id in a path segment: digits, no leading zero, ≤ 15 digits. */
export function parseRepositoryId(raw: string | undefined): number {
  if (!raw || !/^[1-9]\d{0,14}$/.test(raw)) {
    throw new ValidationError('Invalid repository id');
  }
  return Number(raw);
}

export function parseRuleInput(body: unknown): RuleInput {
  if (!isRecord(body)) throw new ValidationError('Expected a JSON object');
  const allowed = new Set([
    'enabled',
    'branch',
    'ciPolicy',
    'requiredWorkflowIds',
    'settleSeconds',
    'cooldownMinutes',
    'chatgptUrl',
  ]);
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) throw new ValidationError(`Unknown field: ${key}`);
  }

  if (typeof body['enabled'] !== 'boolean') {
    throw new ValidationError('enabled must be true or false');
  }
  if (body['branch'] !== undefined && body['branch'] !== null) {
    throw new ValidationError(
      'Only the default branch is supported; leave branch empty',
    );
  }

  const ciPolicy = body['ciPolicy'];
  if (ciPolicy !== 'all_workflows' && ciPolicy !== 'required_workflows') {
    throw new ValidationError(
      'ciPolicy must be all_workflows or required_workflows',
    );
  }

  const rawIds = body['requiredWorkflowIds'] ?? [];
  if (
    !Array.isArray(rawIds) ||
    rawIds.length > LIMITS.maxRequiredWorkflows ||
    !rawIds.every(
      (id) => typeof id === 'number' && Number.isSafeInteger(id) && id > 0,
    )
  ) {
    throw new ValidationError(
      `requiredWorkflowIds must be up to ${LIMITS.maxRequiredWorkflows} workflow ids`,
    );
  }
  const requiredWorkflowIds = [...new Set(rawIds as number[])];
  if (ciPolicy === 'required_workflows' && requiredWorkflowIds.length === 0) {
    throw new ValidationError(
      'Pick at least one required workflow, or use "every workflow that runs"',
    );
  }

  let chatgptUrl: string | null = null;
  const rawUrl = body['chatgptUrl'];
  if (rawUrl !== undefined && rawUrl !== null && rawUrl !== '') {
    chatgptUrl = parseChatGptUrl(rawUrl);
    if (!chatgptUrl) {
      throw new ValidationError(
        'chatgptUrl must be an https://chatgpt.com/c/… conversation link',
      );
    }
  }

  return {
    enabled: body['enabled'],
    ciPolicy: ciPolicy as CiPolicy,
    requiredWorkflowIds,
    settleSeconds: integerIn(
      body['settleSeconds'] ?? LIMITS.settleSeconds.default,
      'settleSeconds',
      LIMITS.settleSeconds,
    ),
    cooldownMinutes: integerIn(
      body['cooldownMinutes'] ?? LIMITS.cooldownMinutes.default,
      'cooldownMinutes',
      LIMITS.cooldownMinutes,
    ),
    chatgptUrl,
  };
}

export function parsePrepareInput(body: unknown): { bypassCi: boolean } {
  if (body === undefined || body === null) return { bypassCi: false };
  if (!isRecord(body)) throw new ValidationError('Expected a JSON object');
  for (const key of Object.keys(body)) {
    if (key !== 'bypassCi') throw new ValidationError(`Unknown field: ${key}`);
  }
  if (body['bypassCi'] !== undefined && typeof body['bypassCi'] !== 'boolean') {
    throw new ValidationError('bypassCi must be true or false');
  }
  return { bypassCi: body['bypassCi'] === true };
}

const PROMPT_STATUSES: readonly PromptStatus[] = [
  'unread',
  'read',
  'dismissed',
];

export function parsePromptStatus(body: unknown): PromptStatus {
  if (
    !isRecord(body) ||
    typeof body['status'] !== 'string' ||
    !PROMPT_STATUSES.includes(body['status'] as PromptStatus)
  ) {
    throw new ValidationError('status must be unread, read or dismissed');
  }
  return body['status'] as PromptStatus;
}

export function parsePromptId(raw: string | undefined): string {
  if (!raw || !/^[0-9a-f-]{36}$/i.test(raw)) {
    throw new ValidationError('Invalid prompt id');
  }
  return raw;
}

export function parsePromptFilter(query: Record<string, unknown>): {
  repositoryId?: number;
  status?: PromptStatus | 'active';
} {
  const repositoryId =
    typeof query['repositoryId'] === 'string' && query['repositoryId'] !== ''
      ? parseRepositoryId(query['repositoryId'])
      : undefined;
  const status = query['status'];
  if (
    status !== undefined &&
    status !== '' &&
    status !== 'active' &&
    !PROMPT_STATUSES.includes(status as PromptStatus)
  ) {
    throw new ValidationError('Unknown status filter');
  }
  return {
    repositoryId,
    status: status ? (status as PromptStatus | 'active') : undefined,
  };
}
