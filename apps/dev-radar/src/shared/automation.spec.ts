import { describe, expect, it } from 'vitest';
import {
  LIMITS,
  deriveAutomationState,
  evaluateCiGate,
  parseChatGptUrl,
  type GateInput,
  type GateRun,
} from './automation';

const MIN = 60_000;
const SHA = 'abc1234';

function run(workflowId: number, over: Partial<GateRun> = {}): GateRun {
  return {
    workflowId,
    name: `wf-${workflowId}`,
    headSha: SHA,
    status: 'completed',
    conclusion: 'success',
    runAttempt: 1,
    createdAt: '2026-10-14T10:00:00Z',
    htmlUrl: `https://github.com/a/b/actions/runs/${workflowId}`,
    ...over,
  };
}

const gate = (over: Partial<GateInput> = {}) =>
  evaluateCiGate({
    runs: [],
    policy: 'all_workflows',
    requiredWorkflowIds: [],
    ageMs: 30 * MIN,
    ...over,
  });

describe('evaluateCiGate — all_workflows', () => {
  it('passes when every observed workflow succeeded', () => {
    const result = gate({ runs: [run(1), run(2)] });
    expect(result).toMatchObject({ verdict: 'pass', reason: 'passed' });
    expect(result.workflows).toHaveLength(2);
  });

  it('waits while one workflow is still running', () => {
    const result = gate({
      runs: [run(1), run(2, { status: 'in_progress', conclusion: null })],
    });
    expect(result).toMatchObject({
      verdict: 'wait',
      reason: 'workflow_running',
    });
    expect(result.detail).toContain('wf-2');
  });

  it('is blocked by a failure even while others run', () => {
    const result = gate({
      runs: [
        run(1, { conclusion: 'failure' }),
        run(2, { status: 'queued', conclusion: null }),
      ],
    });
    expect(result).toMatchObject({
      verdict: 'blocked',
      reason: 'workflow_failed',
    });
  });

  it.each(['cancelled', 'skipped', 'neutral', 'stale', 'action_required'])(
    'does not treat %s as success (stricter than monitoring)',
    (conclusion) => {
      const result = gate({ runs: [run(1, { conclusion })] });
      expect(result.verdict).toBe('blocked');
      expect(result.detail).toContain(conclusion);
    },
  );

  it('waits for the first run inside the grace period, then reads "no CI" — never success', () => {
    expect(gate({ ageMs: 2 * MIN })).toMatchObject({
      verdict: 'wait',
      reason: 'waiting_for_runs',
    });
    const late = gate({ ageMs: (LIMITS.ciGraceMinutes + 1) * MIN });
    expect(late).toMatchObject({ verdict: 'blocked', reason: 'no_ci' });
    expect(late.detail).toMatch(/manually/);
  });

  it('a rerun that passes supersedes the failed attempt of the same workflow', () => {
    const failed = run(1, {
      conclusion: 'failure',
      createdAt: '2026-10-14T10:00:00Z',
    });
    const rerun = run(1, {
      conclusion: 'success',
      createdAt: '2026-10-14T10:09:00Z',
      runAttempt: 2,
    });
    expect(gate({ runs: [failed, rerun] }).verdict).toBe('pass');
    expect(gate({ runs: [rerun, failed] }).verdict).toBe('pass');
  });
});

describe('evaluateCiGate — required_workflows', () => {
  const required = { policy: 'required_workflows' as const };

  it('passes only when every required workflow has a successful run', () => {
    expect(
      gate({
        ...required,
        requiredWorkflowIds: [1, 2],
        runs: [run(1), run(2), run(3, { conclusion: 'failure' })],
      }).verdict,
    ).toBe('pass'); // workflow 3 is not required
  });

  it('a missing required workflow waits, then blocks — and is named', () => {
    const names = new Map([[2, 'Deploy']]);
    const early = gate({
      ...required,
      requiredWorkflowIds: [1, 2],
      runs: [run(1)],
      knownNames: names,
      ageMs: MIN,
    });
    expect(early).toMatchObject({
      verdict: 'wait',
      reason: 'workflow_missing',
    });
    const late = gate({
      ...required,
      requiredWorkflowIds: [1, 2],
      runs: [run(1)],
      knownNames: names,
      ageMs: 60 * MIN,
    });
    expect(late).toMatchObject({
      verdict: 'blocked',
      reason: 'workflow_missing',
    });
    expect(late.detail).toContain('Deploy');
  });

  it('a required workflow that failed blocks even if the others passed', () => {
    const result = gate({
      ...required,
      requiredWorkflowIds: [1, 2],
      runs: [run(1), run(2, { conclusion: 'timed_out' })],
    });
    expect(result).toMatchObject({
      verdict: 'blocked',
      reason: 'workflow_failed',
    });
  });

  it('an empty required list never passes', () => {
    expect(
      gate({ ...required, requiredWorkflowIds: [], runs: [run(1)] }).verdict,
    ).toBe('blocked');
  });
});

describe('deriveAutomationState', () => {
  const base = { enabled: true, followed: true };
  it.each([
    [{ ...base, enabled: false, latestRun: null }, 'disabled'],
    [{ ...base, followed: false, latestRun: null }, 'disabled'],
    [{ ...base, latestRun: null }, 'waiting_update'],
    [
      { ...base, latestRun: { status: 'pending', reason: 'workflow_running' } },
      'waiting_ci',
    ],
    [
      { ...base, latestRun: { status: 'pending', reason: 'settling' } },
      'waiting_ci',
    ],
    [
      { ...base, latestRun: { status: 'pending', reason: 'workflow_failed' } },
      'blocked',
    ],
    [{ ...base, latestRun: { status: 'pending', reason: 'no_ci' } }, 'blocked'],
    [{ ...base, latestRun: { status: 'running', reason: null } }, 'preparing'],
    [
      { ...base, latestRun: { status: 'succeeded', reason: 'prepared' } },
      'ready',
    ],
    [
      { ...base, latestRun: { status: 'failed', reason: 'access_revoked' } },
      'failed',
    ],
    [
      { ...base, latestRun: { status: 'superseded', reason: 'newer_commit' } },
      'skipped',
    ],
    [
      { ...base, latestRun: { status: 'expired', reason: 'expired' } },
      'skipped',
    ],
    [
      { ...base, latestRun: { status: 'expired', reason: 'workflow_failed' } },
      'blocked',
    ],
  ] as const)('%j -> %s', (input, expected) => {
    expect(deriveAutomationState(input)).toBe(expected);
  });
});

describe('parseChatGptUrl', () => {
  it('accepts https ChatGPT conversation links and drops the fragment', () => {
    expect(parseChatGptUrl('https://chatgpt.com/c/abc-123#x')).toBe(
      'https://chatgpt.com/c/abc-123',
    );
    expect(
      parseChatGptUrl('https://chat.openai.com/g/g-abc/c/1'),
    ).not.toBeNull();
  });
  it.each([
    'http://chatgpt.com/c/1',
    'https://evil.example/c/1',
    'https://chatgpt.com.evil.example/c/1',
    'https://user:pw@chatgpt.com/c/1',
    'https://chatgpt.com:8443/c/1',
    'https://chatgpt.com/',
    'javascript:alert(1)',
    'https://chatgpt.com/c/' + 'a'.repeat(400),
    '',
    42,
    null,
  ])('rejects %j', (value) => {
    expect(parseChatGptUrl(value)).toBeNull();
  });
});
