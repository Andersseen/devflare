import { createAppJwt } from './app-auth';
import { GitHubTransport, type RequestBudget } from './client';
import { GitHubApiError } from './errors';
import type {
  GhCommit,
  GhInstallation,
  GhPullRequest,
  GhRelease,
  GhRepository,
  GhTag,
  GhWorkflowRun,
} from './types';

/**
 * Every GitHub read DevRadar performs, as one interface. Production uses
 * `createGitHubApi`; tests pass a fake `fetch` to the same factory, so the
 * paths, pagination and error handling under test are the real ones.
 *
 * Read-only by construction: the only non-GET is the installation-token
 * exchange, which grants nothing the App has not been given.
 */
export interface GitHubApi {
  listInstallations(): Promise<GhInstallation[]>;
  /** A short-lived installation access token. Keep it in memory only. */
  installationToken(installationId: number): Promise<string>;
  listInstallationRepositories(token: string): Promise<GhRepository[]>;
  /** null for an empty repository. */
  getHeadCommit(
    token: string,
    fullName: string,
    branch: string,
  ): Promise<GhCommit | null>;
  listOpenPullRequests(
    token: string,
    fullName: string,
  ): Promise<GhPullRequest[]>;
  /** null when Actions cannot be read (permission, feature off) — CI is then "unknown". */
  listWorkflowRuns(
    token: string,
    fullName: string,
  ): Promise<GhWorkflowRun[] | null>;
  listReleases(token: string, fullName: string): Promise<GhRelease[]>;
  latestTag(token: string, fullName: string): Promise<string | null>;
}

export interface GitHubApiOptions {
  appId: string;
  privateKey: string;
  fetch: typeof fetch;
  budget: RequestBudget;
  baseUrl?: string;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const MAX_PR_PAGES = 3; // 300 open PRs per repository
const MAX_REPO_PAGES = 10; // 1000 repositories per installation
const MAX_INSTALLATION_PAGES = 3;
const PER_PAGE = 100;

/** Statuses meaning "this resource is not there / not allowed", not "broken". */
const ABSENT = new Set([403, 404, 409, 410, 451]);

export function createGitHubApi(options: GitHubApiOptions): GitHubApi {
  const http = new GitHubTransport(options);
  const now = options.now ?? Date.now;
  let jwt: { value: string; expiresAt: number } | null = null;

  async function appToken(): Promise<string> {
    if (jwt && jwt.expiresAt > now()) return jwt.value;
    const value = await createAppJwt(
      options.appId,
      options.privateKey,
      Math.floor(now() / 1000),
    );
    // Valid ~9 minutes; reuse for at most 5.
    jwt = { value, expiresAt: now() + 5 * 60 * 1000 };
    return value;
  }

  return {
    async listInstallations() {
      const { items } = await http.paginate<GhInstallation>(
        `/app/installations?per_page=${PER_PAGE}`,
        { token: await appToken(), maxPages: MAX_INSTALLATION_PAGES },
      );
      return items;
    },

    async installationToken(installationId) {
      const page = await http.request<{ token: string }>(
        `/app/installations/${installationId}/access_tokens`,
        { token: await appToken(), method: 'POST', body: {} },
      );
      return page.data.token;
    },

    async listInstallationRepositories(token) {
      const { items } = await http.paginate<
        GhRepository,
        { repositories: GhRepository[] }
      >(`/installation/repositories?per_page=${PER_PAGE}`, {
        token,
        maxPages: MAX_REPO_PAGES,
        pick: (body) => body.repositories,
      });
      return items;
    },

    async getHeadCommit(token, fullName, branch) {
      try {
        const page = await http.request<GhCommit>(
          `/repos/${fullName}/commits/${encodeURIComponent(branch)}`,
          { token },
        );
        return page.data;
      } catch (error) {
        // 409: empty repository. 404: branch missing.
        if (
          error instanceof GitHubApiError &&
          (error.status === 409 || error.status === 404)
        ) {
          return null;
        }
        throw error;
      }
    },

    async listOpenPullRequests(token, fullName) {
      const { items } = await http.paginate<GhPullRequest>(
        `/repos/${fullName}/pulls?state=open&sort=updated&direction=desc&per_page=${PER_PAGE}`,
        { token, maxPages: MAX_PR_PAGES },
      );
      return items;
    },

    async listWorkflowRuns(token, fullName) {
      try {
        const page = await http.request<{ workflow_runs: GhWorkflowRun[] }>(
          `/repos/${fullName}/actions/runs?per_page=50`,
          { token },
        );
        return page.data.workflow_runs;
      } catch (error) {
        if (error instanceof GitHubApiError && ABSENT.has(error.status)) {
          // A rate limit is a GitHubRateLimitError (status 429) and rethrown.
          return null;
        }
        throw error;
      }
    },

    async listReleases(token, fullName) {
      const page = await http.request<GhRelease[]>(
        `/repos/${fullName}/releases?per_page=10`,
        { token },
      );
      return page.data;
    },

    async latestTag(token, fullName) {
      const page = await http.request<GhTag[]>(
        `/repos/${fullName}/tags?per_page=1`,
        { token },
      );
      return page.data[0]?.name ?? null;
    },
  };
}
