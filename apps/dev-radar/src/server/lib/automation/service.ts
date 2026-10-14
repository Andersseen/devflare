import {
  deriveAutomationState,
  type PromptStatus,
} from '../../../shared/automation';
import type {
  AutomationDetailDto,
  AutomationRuleDto,
  AutomationRunDto,
  AutomationsDto,
  PromptDetailDto,
  PromptListDto,
  PromptSummaryDto,
} from '../../../shared/dto';
import type { RepositoryContext } from '../../../shared/prompt-context';
import type { SqlDatabase } from '../../db';
import {
  getRule,
  isFollowing,
  latestAutomaticRuns,
  listEligibleRepositories,
  listFollowedIds,
  listKnownWorkflows,
  listRules,
  listRuns,
  requiredWorkflowIds,
  upsertRule,
  getRunById,
  type RuleInput,
  type RuleRow,
  type RunRow,
} from '../store/automation';
import {
  countUnreadPrompts,
  getPrompt,
  listPrompts,
  setPromptStatus,
  type PromptListRow,
  type PromptRow,
} from '../store/prompts';
import { getRepository, type RepositoryRow } from '../store/repositories';

/**
 * Read models and rule management for the automation API (spec 023). h3-free:
 * routes authenticate and validate, this decides. Everything is scoped to the
 * user id it is given.
 */

export class ServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function toRunDto(row: RunRow): AutomationRunDto {
  const waiting = row.status === 'pending';
  return {
    id: row.id,
    sha: row.sha,
    branch: row.branch,
    trigger: row.trigger,
    ciBypassed: row.ci_bypassed === 1,
    status: row.status,
    reason: row.reason,
    detail: row.detail,
    attempts: row.attempts,
    nextCheckAt: waiting ? row.next_check_at : null,
    promptId: row.prompt_id,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
  };
}

function toRuleDto(
  rule: RuleRow,
  repo: RepositoryRow | null,
  followed: boolean,
  latest: RunRow | null,
): AutomationRuleDto {
  return {
    repositoryId: rule.repository_id,
    repositoryFullName:
      repo?.full_name ??
      latest?.repository_full_name ??
      `#${rule.repository_id}`,
    repositoryAvailable: repo !== null,
    followed,
    enabled: rule.enabled === 1,
    state: deriveAutomationState({
      enabled: rule.enabled === 1 && repo !== null,
      followed,
      latestRun: latest
        ? { status: latest.status, reason: latest.reason }
        : null,
    }),
    branch: repo?.default_branch ?? 'main',
    ciPolicy: rule.ci_policy,
    requiredWorkflowIds: requiredWorkflowIds(rule),
    settleSeconds: rule.settle_seconds,
    cooldownMinutes: rule.cooldown_minutes,
    chatgptUrl: rule.chatgpt_url,
    lastTriggeredSha: rule.last_triggered_sha,
    lastTriggeredAt: rule.last_triggered_at,
    lastPreparedSha: rule.last_prepared_sha,
    lastPreparedAt: rule.last_prepared_at,
    latestRun: latest ? toRunDto(latest) : null,
  };
}

export async function listAutomations(
  db: SqlDatabase,
  userId: string,
  githubConfigured: boolean,
): Promise<AutomationsDto> {
  const [rules, latest, followed] = await Promise.all([
    listRules(db, userId),
    latestAutomaticRuns(db, userId),
    listFollowedIds(db, userId),
  ]);

  const dtos: AutomationRuleDto[] = [];
  for (const rule of rules) {
    const repo = await getRepository(db, rule.repository_id);
    dtos.push(
      toRuleDto(
        rule,
        repo,
        followed.has(rule.repository_id),
        latest.get(rule.id) ?? null,
      ),
    );
  }

  const withRule = new Set(rules.map((rule) => rule.repository_id));
  const eligible = await listEligibleRepositories(db, userId);

  return {
    githubConfigured,
    rules: dtos,
    eligible: eligible
      .filter((repo) => !withRule.has(repo.id))
      .map((repo) => ({
        id: repo.id,
        fullName: repo.full_name,
        defaultBranch: repo.default_branch,
        ciState: repo.ci_state,
      })),
    unreadPrompts: await countUnreadPrompts(db, userId),
  };
}

export async function getAutomationDetail(
  db: SqlDatabase,
  userId: string,
  repositoryId: number,
  githubConfigured: boolean,
): Promise<AutomationDetailDto> {
  const repo = await getRepository(db, repositoryId);
  if (!repo) throw new ServiceError(404, 'not_found', 'Repository not found');

  const [rule, followed, runs, workflows] = await Promise.all([
    getRule(db, userId, repositoryId),
    isFollowing(db, userId, repositoryId),
    listRuns(db, userId, repositoryId, 20),
    listKnownWorkflows(db, repositoryId),
  ]);
  const latestAutomatic =
    runs.find(
      (run) => run.trigger === 'automatic' && run.rule_id === rule?.id,
    ) ?? null;

  return {
    githubConfigured,
    repository: {
      id: repo.id,
      fullName: repo.full_name,
      htmlUrl: repo.html_url,
      defaultBranch: repo.default_branch,
      followed,
    },
    rule: rule ? toRuleDto(rule, repo, followed, latestAutomatic) : null,
    workflows,
    runs: runs.map(toRunDto),
  };
}

export async function saveRule(
  db: SqlDatabase,
  userId: string,
  repositoryId: number,
  input: RuleInput,
): Promise<AutomationRuleDto> {
  const repo = await getRepository(db, repositoryId);
  if (!repo) throw new ServiceError(404, 'not_found', 'Repository not found');
  const followed = await isFollowing(db, userId, repositoryId);
  if (input.enabled && !followed) {
    throw new ServiceError(
      409,
      'not_followed',
      'Follow the repository before enabling an automation for it.',
    );
  }
  const rule = await upsertRule(db, userId, repositoryId, input);
  const latest = (await latestAutomaticRuns(db, userId)).get(rule.id) ?? null;
  return toRuleDto(rule, repo, followed, latest);
}

// ---- prompts ---------------------------------------------------------------

function toSummary(row: PromptListRow | PromptRow): PromptSummaryDto {
  return {
    id: row.id,
    repositoryId: row.repository_id,
    repositoryFullName: row.repository_full_name,
    branch: row.branch,
    sha: row.sha,
    trigger: row.trigger,
    ciBypassed: row.ci_bypassed === 1,
    revision: row.revision,
    ciState: row.ci_state,
    summary: row.summary,
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function listPromptSummaries(
  db: SqlDatabase,
  userId: string,
  filter: { repositoryId?: number; status?: PromptStatus | 'active' },
): Promise<PromptListDto> {
  const rows = await listPrompts(db, userId, { ...filter, limit: 100 });
  return {
    prompts: rows.map(toSummary),
    unread: await countUnreadPrompts(db, userId),
  };
}

export async function getPromptDetail(
  db: SqlDatabase,
  userId: string,
  id: string,
): Promise<PromptDetailDto> {
  const row = await getPrompt(db, userId, id);
  if (!row) throw new ServiceError(404, 'not_found', 'Prompt not found');

  let context: RepositoryContext;
  try {
    context = JSON.parse(row.context) as RepositoryContext;
  } catch {
    throw new ServiceError(500, 'corrupt', 'The stored context is unreadable');
  }
  const [rule, run] = await Promise.all([
    getRule(db, userId, row.repository_id),
    row.run_id ? getRunById(db, row.run_id) : Promise.resolve(null),
  ]);
  const base = context.repository.url;
  return {
    ...toSummary(row),
    prompt: row.prompt,
    context,
    repositoryUrl: base,
    commitUrl: `${base}/commit/${row.sha}`,
    chatgptUrl: rule?.chatgpt_url ?? null,
    run: run && run.user_id === userId ? toRunDto(run) : null,
  };
}

export async function updatePromptStatus(
  db: SqlDatabase,
  userId: string,
  id: string,
  status: PromptStatus,
): Promise<void> {
  const ok = await setPromptStatus(db, userId, id, status);
  if (!ok) throw new ServiceError(404, 'not_found', 'Prompt not found');
}
