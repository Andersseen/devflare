/** GitHub failures DevRadar distinguishes. Messages never contain tokens. */

export class GitHubApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

/** Primary or secondary rate limit: stop spending requests until `resetAt`. */
export class GitHubRateLimitError extends GitHubApiError {
  constructor(
    path: string,
    /** When requests may resume (ISO), if GitHub said. */
    readonly resetAt: string | null,
  ) {
    super(
      429,
      path,
      resetAt
        ? `GitHub rate limit reached; resets at ${resetAt}`
        : 'GitHub rate limit reached',
    );
    this.name = 'GitHubRateLimitError';
  }
}

/** The per-run request budget is spent; remaining work waits for the next run. */
export class RequestBudgetExhaustedError extends Error {
  constructor() {
    super('GitHub request budget for this run is exhausted');
    this.name = 'RequestBudgetExhaustedError';
  }
}

export class GitHubConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitHubConfigError';
  }
}
