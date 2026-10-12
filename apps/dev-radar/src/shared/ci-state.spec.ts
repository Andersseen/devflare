import { ciNeedsAttention, computeCiState, type RunSummary } from './ci-state';

let seq = 0;
function run(over: Partial<RunSummary> = {}): RunSummary {
  seq++;
  return {
    workflowId: 1,
    headSha: 'aaa',
    status: 'completed',
    conclusion: 'success',
    runAttempt: 1,
    createdAt: new Date(Date.UTC(2026, 9, 1, 10, seq)).toISOString(),
    ...over,
  };
}

describe('computeCiState', () => {
  it('a repository without workflow runs has NO CI — never success', () => {
    expect(computeCiState([])).toEqual({ state: 'none', sha: null });
  });

  it('is success only when every counted workflow succeeded', () => {
    expect(computeCiState([run(), run({ workflowId: 2 })])).toEqual({
      state: 'success',
      sha: 'aaa',
    });
  });

  it('is failure when any workflow failed, even while others still run', () => {
    const result = computeCiState([
      run({ workflowId: 1, conclusion: 'failure' }),
      run({ workflowId: 2, status: 'in_progress', conclusion: null }),
    ]);
    expect(result.state).toBe('failure');
  });

  it.each(['failure', 'timed_out', 'startup_failure'])(
    '%s counts as failed',
    (conclusion) => {
      expect(computeCiState([run({ conclusion })]).state).toBe('failure');
    },
  );

  it.each(['queued', 'in_progress', 'waiting', 'requested', 'pending'])(
    'status %s is pending',
    (status) => {
      expect(computeCiState([run({ status, conclusion: null })]).state).toBe(
        'pending',
      );
    },
  );

  it('treats action_required as pending: a human must act before it can pass', () => {
    expect(computeCiState([run({ conclusion: 'action_required' })]).state).toBe(
      'pending',
    );
  });

  it('a passing re-run supersedes the failed attempt it retried', () => {
    const failed = run({
      conclusion: 'failure',
      runAttempt: 1,
      createdAt: '2026-10-01T10:00:00Z',
    });
    const retried = run({
      conclusion: 'success',
      runAttempt: 2,
      createdAt: '2026-10-01T10:00:00Z',
    });
    expect(computeCiState([failed, retried]).state).toBe('success');
    expect(computeCiState([retried, failed]).state).toBe('success');
  });

  it('ignores cancelled and skipped runs', () => {
    expect(
      computeCiState([
        run(),
        run({ workflowId: 2, conclusion: 'cancelled' }),
        run({ workflowId: 3, conclusion: 'skipped' }),
      ]).state,
    ).toBe('success');
  });

  it('is unknown when every run was cancelled/skipped: no signal either way', () => {
    expect(computeCiState([run({ conclusion: 'cancelled' })])).toEqual({
      state: 'unknown',
      sha: 'aaa',
    });
  });

  it('evaluates the newest commit that ran workflows, not older ones', () => {
    const result = computeCiState([
      run({
        headSha: 'old',
        conclusion: 'failure',
        createdAt: '2026-09-01T00:00:00Z',
      }),
      run({
        headSha: 'new',
        conclusion: 'success',
        createdAt: '2026-10-01T00:00:00Z',
      }),
    ]);
    expect(result).toEqual({ state: 'success', sha: 'new' });
  });

  it('only the latest run of each workflow counts', () => {
    const result = computeCiState([
      run({ conclusion: 'failure', createdAt: '2026-10-01T10:00:00Z' }),
      run({ conclusion: 'success', createdAt: '2026-10-01T10:30:00Z' }),
    ]);
    expect(result.state).toBe('success');
  });
});

describe('ciNeedsAttention', () => {
  it('flags failing and running, but not "no CI"', () => {
    expect(ciNeedsAttention('failure')).toBe(true);
    expect(ciNeedsAttention('pending')).toBe(true);
    expect(ciNeedsAttention('success')).toBe(false);
    expect(ciNeedsAttention('none')).toBe(false);
    expect(ciNeedsAttention('unknown')).toBe(false);
  });
});
