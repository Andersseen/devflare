/**
 * Automation vocabulary shared by the Worker and the dashboard (spec 023):
 * limits, the strict CI gate and the derived, user-facing automation state.
 * Pure and framework-free.
 */

import { latestPerWorkflow, type RunSummary } from './ci-state';

export const AUTOMATION_TYPE = 'next_development_prompt' as const;
export type AutomationType = typeof AUTOMATION_TYPE;

export type CiPolicy = 'all_workflows' | 'required_workflows';
export type RunTrigger = 'automatic' | 'manual';
export type RunStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'superseded'
  | 'expired'
  | 'failed'
  | 'skipped';
export type PromptStatus = 'unread' | 'read' | 'dismissed';

export const LIMITS = {
  settleSeconds: { min: 0, max: 3600, default: 120 },
  cooldownMinutes: { min: 0, max: 1440, default: 0 },
  maxRequiredWorkflows: 10,
  /** Transient-failure attempts before a run is marked failed. */
  maxAttempts: 5,
  /** A pending run that never becomes eligible is dropped after this long. */
  runExpiryHours: 48,
  /** Before this age an absent required workflow / no run at all is "not yet". */
  ciGraceMinutes: 10,
} as const;

/** Why a run is waiting, blocked or finished. A contract with the dashboard. */
export type RunReason =
  | 'settling'
  | 'cooldown'
  | 'waiting_for_runs'
  | 'workflow_running'
  | 'workflow_failed'
  | 'workflow_missing'
  | 'no_ci'
  | 'newer_commit'
  | 'branch_changed'
  | 'rule_disabled'
  | 'not_followed'
  | 'repository_unavailable'
  | 'github_not_configured'
  | 'access_revoked'
  | 'github_unavailable'
  | 'interrupted'
  | 'expired'
  | 'preparation_failed'
  | 'prepared';

// ---- CI gate ---------------------------------------------------------------

export interface GateRun extends RunSummary {
  name: string;
  htmlUrl: string | null;
}

export type GateWorkflowState = 'success' | 'running' | 'failed' | 'missing';

export interface GateWorkflow {
  id: number;
  name: string;
  state: GateWorkflowState;
  /** GitHub's conclusion/status, for the explanation. */
  outcome: string | null;
  url: string | null;
}

export interface GateResult {
  verdict: 'pass' | 'wait' | 'blocked';
  reason:
    | 'passed'
    | 'waiting_for_runs'
    | 'workflow_running'
    | 'workflow_failed'
    | 'workflow_missing'
    | 'no_ci';
  detail: string;
  workflows: GateWorkflow[];
}

export interface GateInput {
  /** Runs of the exact commit on the target branch, push-triggered, any order. */
  runs: readonly GateRun[];
  policy: CiPolicy;
  requiredWorkflowIds: readonly number[];
  /** Names of workflows seen anywhere, for naming a required one that has no run. */
  knownNames?: ReadonlyMap<number, string>;
  /** Age of the automation run (ms) — drives the "not started yet" grace. */
  ageMs: number;
}

function classify(run: GateRun): GateWorkflow {
  const base = {
    id: run.workflowId,
    name: run.name,
    url: run.htmlUrl,
  };
  if (run.status !== 'completed') {
    return { ...base, state: 'running', outcome: run.status };
  }
  if (run.conclusion === 'success') {
    return { ...base, state: 'success', outcome: 'success' };
  }
  // Strict, unlike monitoring: cancelled, skipped, neutral, stale and
  // action_required are not success either.
  return { ...base, state: 'failed', outcome: run.conclusion ?? 'unknown' };
}

const quote = (workflows: GateWorkflow[]): string =>
  workflows
    .map((w) => (w.outcome ? `${w.name} (${w.outcome})` : w.name))
    .join(', ');

export function evaluateCiGate(input: GateInput): GateResult {
  const graceMs = LIMITS.ciGraceMinutes * 60_000;
  const withinGrace = input.ageMs < graceMs;
  const latest = latestPerWorkflow([...input.runs]);
  const byId = new Map(latest.map((run) => [run.workflowId, run]));

  let observed: GateWorkflow[];
  if (input.policy === 'required_workflows') {
    observed = input.requiredWorkflowIds.map((id) => {
      const run = byId.get(id);
      if (run) return classify(run);
      return {
        id,
        name: input.knownNames?.get(id) ?? `Workflow #${id}`,
        state: 'missing' as const,
        outcome: null,
        url: null,
      };
    });
  } else {
    observed = latest.map(classify);
  }

  if (input.policy === 'required_workflows' && observed.length === 0) {
    // A rule cannot be saved this way; an old row must still never pass.
    return {
      verdict: 'blocked',
      reason: 'workflow_missing',
      detail: 'No required workflow is configured.',
      workflows: [],
    };
  }

  if (input.policy === 'all_workflows' && observed.length === 0) {
    return withinGrace
      ? {
          verdict: 'wait',
          reason: 'waiting_for_runs',
          detail: 'No workflow run has been reported for this commit yet.',
          workflows: [],
        }
      : {
          verdict: 'blocked',
          reason: 'no_ci',
          detail:
            'No workflow run exists for this commit. A repository without CI is never treated as passing — prepare the prompt manually to bypass the gate.',
          workflows: [],
        };
  }

  const failed = observed.filter((w) => w.state === 'failed');
  if (failed.length > 0) {
    return {
      verdict: 'blocked',
      reason: 'workflow_failed',
      detail: `Did not succeed: ${quote(failed)}.`,
      workflows: observed,
    };
  }

  const missing = observed.filter((w) => w.state === 'missing');
  if (missing.length > 0) {
    const names = missing.map((w) => w.name).join(', ');
    return withinGrace
      ? {
          verdict: 'wait',
          reason: 'workflow_missing',
          detail: `Waiting for required workflow ${names} to start.`,
          workflows: observed,
        }
      : {
          verdict: 'blocked',
          reason: 'workflow_missing',
          detail: `Required workflow ${names} has no run for this commit.`,
          workflows: observed,
        };
  }

  const running = observed.filter((w) => w.state === 'running');
  if (running.length > 0) {
    return {
      verdict: 'wait',
      reason: 'workflow_running',
      detail: `Still running: ${quote(running)}.`,
      workflows: observed,
    };
  }

  return {
    verdict: 'pass',
    reason: 'passed',
    detail: `All ${observed.length} workflow${observed.length === 1 ? '' : 's'} succeeded for this commit.`,
    workflows: observed,
  };
}

// ---- Derived state ---------------------------------------------------------

export type AutomationState =
  | 'disabled'
  | 'waiting_update'
  | 'waiting_ci'
  | 'preparing'
  | 'ready'
  | 'blocked'
  | 'failed'
  | 'skipped';

export const AUTOMATION_STATE_LABEL: Record<AutomationState, string> = {
  disabled: 'Disabled',
  waiting_update: 'Waiting for update',
  waiting_ci: 'Waiting for CI',
  preparing: 'Preparing',
  ready: 'Ready',
  blocked: 'Blocked',
  failed: 'Failed',
  skipped: 'Skipped',
};

export interface StateInput {
  enabled: boolean;
  followed: boolean;
  /** The latest *automatic* run of the rule, if any. */
  latestRun: { status: RunStatus; reason: RunReason | null } | null;
}

const BLOCKING: ReadonlySet<RunReason | null> = new Set([
  'workflow_failed',
  'workflow_missing',
  'no_ci',
]);

export function deriveAutomationState(input: StateInput): AutomationState {
  if (!input.enabled || !input.followed) return 'disabled';
  const run = input.latestRun;
  if (!run) return 'waiting_update';
  switch (run.status) {
    case 'running':
      return 'preparing';
    case 'succeeded':
      return 'ready';
    case 'failed':
      return 'failed';
    case 'superseded':
    case 'expired':
    case 'skipped':
      return run.status === 'expired' && BLOCKING.has(run.reason)
        ? 'blocked'
        : 'skipped';
    case 'pending':
      return BLOCKING.has(run.reason) ? 'blocked' : 'waiting_ci';
  }
}

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  pending: 'Waiting',
  running: 'Preparing',
  succeeded: 'Prepared',
  superseded: 'Superseded',
  expired: 'Expired',
  failed: 'Failed',
  skipped: 'Skipped',
};

export const RUN_REASON_LABEL: Record<RunReason, string> = {
  settling: 'Waiting for the settling period',
  cooldown: 'Cooldown after the last preparation',
  waiting_for_runs: 'Waiting for the first workflow run',
  workflow_running: 'CI is still running',
  workflow_failed: 'CI did not pass',
  workflow_missing: 'A required workflow did not run',
  no_ci: 'No CI results for this commit',
  newer_commit: 'A newer commit reached the branch',
  branch_changed: 'The target branch changed',
  rule_disabled: 'The automation was disabled',
  not_followed: 'The repository is no longer followed',
  repository_unavailable: 'The repository is not available',
  github_not_configured: 'The GitHub App is not configured',
  access_revoked: 'GitHub access to the repository was revoked',
  github_unavailable: 'GitHub could not be reached',
  interrupted: 'The preparation was interrupted',
  expired: 'CI never reached a passing state in time',
  preparation_failed: 'The prompt could not be prepared',
  prepared: 'Prompt prepared',
};

// ---- Validation helpers ----------------------------------------------------

const CHATGPT_HOSTS = new Set([
  'chatgpt.com',
  'www.chatgpt.com',
  'chat.openai.com',
]);
const CHATGPT_PATH = /^\/(?:c|g|share|project)\//;

/**
 * A user-owned ChatGPT conversation link. HTTPS only, ChatGPT hosts only, no
 * credentials or port. Returns the normalized URL, or null if unsafe.
 */
export function parseChatGptUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 300) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (
    url.protocol !== 'https:' ||
    !CHATGPT_HOSTS.has(url.hostname) ||
    url.username !== '' ||
    url.password !== '' ||
    url.port !== '' ||
    !CHATGPT_PATH.test(url.pathname)
  ) {
    return null;
  }
  url.hash = '';
  return url.toString();
}
