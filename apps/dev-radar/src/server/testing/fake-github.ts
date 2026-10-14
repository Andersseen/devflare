/**
 * Test-only: GitHub's REST API as a `fetch`, driven by a small in-memory
 * "world". The production GitHubApi runs against it unchanged, so paths,
 * headers, pagination and error handling under test are the real ones. No test
 * ever reaches api.github.com, and none of this ships (excluded from the app
 * tsconfig).
 */

import { generateKeyPairSync } from 'node:crypto';
import type {
  GhCommit,
  GhCommitListItem,
  GhCommitPull,
  GhInstallation,
  GhPullRequest,
  GhRelease,
  GhRepository,
  GhWorkflowRun,
} from '../lib/github/types';

export interface FakeRepoState {
  repo: GhRepository;
  commit: GhCommit | null;
  /** Each entry is one page. */
  pulls: GhPullRequest[][];
  /** null = Actions unreadable (403). */
  runs: GhWorkflowRun[] | null;
  releases: GhRelease[];
  tags: string[];
  /** Repository files by path; directory listings are derived from them. */
  files?: Record<string, string>;
  /** Paths whose reported size is forced (to exercise the size limits). */
  fileSizes?: Record<string, number>;
  /** Newest-first history for `GET /commits?sha=`. */
  history?: GhCommitListItem[];
  /** Changed paths of the head commit (`GET /commits/{sha}` -> files). */
  changedFiles?: string[];
  /** `GET /commits/{sha}/pulls`. */
  commitPulls?: GhCommitPull[];
}

export interface FakeWorld {
  installations: GhInstallation[];
  /** installation id -> repositories (one entry per page). */
  repositories: Record<number, FakeRepoState[][]>;
  /** Path (no query) -> forced response, e.g. a 403 rate limit. */
  failures: Record<string, () => Response>;
  tokenCounter: number;
}

export function emptyWorld(): FakeWorld {
  return { installations: [], repositories: {}, failures: {}, tokenCounter: 0 };
}

const json = (
  body: unknown,
  init: ResponseInit = {},
  headers: HeadersInit = {},
) =>
  new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { 'content-type': 'application/json', ...headers },
  });

export interface FakeGitHub {
  fetch: typeof fetch;
  /** "METHOD /path" of every request, in order. */
  calls: string[];
  /** Authorization headers seen, for token-hygiene assertions. */
  authorizations: string[];
}

export function createFakeGitHub(world: FakeWorld): FakeGitHub {
  const calls: string[] = [];
  const authorizations: string[] = [];

  const allRepos = () =>
    Object.values(world.repositories).flatMap((pages) => pages.flat());

  const fake: typeof fetch = async (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : (input as Request).url,
    );
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${url.pathname}`);
    authorizations.push(
      String(
        (init?.headers as Record<string, string> | undefined)?.[
          'Authorization'
        ] ?? '',
      ),
    );

    const forced = world.failures[url.pathname];
    if (forced) return forced();

    const page = Number(url.searchParams.get('page') ?? '1');
    const link = (total: number): Record<string, string> =>
      page < total
        ? {
            link: `<${url.origin}${url.pathname}?${new URLSearchParams({
              ...Object.fromEntries(url.searchParams),
              page: String(page + 1),
            })}>; rel="next"`,
          }
        : {};

    if (url.pathname === '/app/installations' && method === 'GET') {
      return json(world.installations);
    }

    const token = url.pathname.match(
      /^\/app\/installations\/(\d+)\/access_tokens$/,
    );
    if (token && method === 'POST') {
      world.tokenCounter++;
      return json(
        { token: `ghs_fake_${token[1]}_${world.tokenCounter}` },
        { status: 201 },
      );
    }

    if (url.pathname === '/installation/repositories') {
      const installationId = Number(
        /ghs_fake_(\d+)_/.exec(authorizations.at(-1) ?? '')?.[1],
      );
      const pages = world.repositories[installationId] ?? [[]];
      return json(
        {
          total_count: pages.flat().length,
          repositories: (pages[page - 1] ?? []).map((r) => r.repo),
        },
        {},
        link(pages.length),
      );
    }

    const repoRoute = url.pathname.match(/^\/repos\/([^/]+\/[^/]+)\/(.+)$/);
    if (repoRoute) {
      const state = allRepos().find((r) => r.repo.full_name === repoRoute[1]);
      if (!state) return json({ message: 'Not Found' }, { status: 404 });
      const rest = repoRoute[2];

      if (rest === 'commits') {
        return json(state.history ?? (state.commit ? [state.commit] : []));
      }
      if (/^commits\/[^/]+\/pulls$/.test(rest)) {
        return json(state.commitPulls ?? []);
      }
      if (rest.startsWith('contents')) {
        return contents(
          state,
          decodeURIComponent(rest.slice('contents'.length)),
        );
      }
      if (rest.startsWith('commits/')) {
        return state.commit
          ? json({
              ...state.commit,
              files: (state.changedFiles ?? []).map((filename) => ({
                filename,
                status: 'modified',
              })),
            })
          : json({ message: 'Git Repository is empty.' }, { status: 409 });
      }
      if (rest === 'pulls') {
        return json(state.pulls[page - 1] ?? [], {}, link(state.pulls.length));
      }
      if (rest === 'actions/runs') {
        const headSha = url.searchParams.get('head_sha');
        if (state.runs && headSha) {
          const runs = state.runs.filter((r) => r.head_sha === headSha);
          return json({ total_count: runs.length, workflow_runs: runs });
        }
        return state.runs === null
          ? json(
              { message: 'Resource not accessible by integration' },
              { status: 403 },
            )
          : json({ total_count: state.runs.length, workflow_runs: state.runs });
      }
      if (rest === 'releases') return json(state.releases);
      if (rest === 'tags') return json(state.tags.map((name) => ({ name })));
    }

    return json({ message: 'Not Found' }, { status: 404 });
  };

  return { fetch: fake, calls, authorizations };
}

/** GitHub's contents API over `state.files`. */
function contents(state: FakeRepoState, rawPath: string): Response {
  const files = state.files ?? {};
  const path = rawPath.replace(/^\/+|\/+$/g, '');
  if (path in files) {
    const size = state.fileSizes?.[path] ?? Buffer.byteLength(files[path]);
    return json({
      type: 'file',
      size,
      encoding: 'base64',
      content: Buffer.from(files[path]).toString('base64'),
    });
  }
  const prefix = path === '' ? '' : `${path}/`;
  const children = new Map<string, 'file' | 'dir'>();
  for (const file of Object.keys(files)) {
    if (!file.startsWith(prefix)) continue;
    const rest = file.slice(prefix.length);
    const head = rest.split('/')[0];
    children.set(head, rest.includes('/') ? 'dir' : 'file');
  }
  if (children.size === 0) {
    return json({ message: 'Not Found' }, { status: 404 });
  }
  return json(
    [...children].map(([name, type]) => ({
      name,
      path: `${prefix}${name}`,
      type,
      size:
        type === 'file'
          ? (state.fileSizes?.[`${prefix}${name}`] ??
            Buffer.byteLength(files[`${prefix}${name}`]))
          : 0,
    })),
  );
}

let cachedKey: string | null = null;
/** A throwaway 2048-bit PKCS#1 key, as GitHub issues them. Generated once. */
export function testPrivateKeyPem(): string {
  cachedKey ??= generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  }).privateKey;
  return cachedKey;
}

// ---- fixture builders -------------------------------------------------------

export function ghRepo(
  id: number,
  fullName: string,
  over: Partial<GhRepository> = {},
): GhRepository {
  const [owner, name] = fullName.split('/');
  return {
    id,
    name,
    full_name: fullName,
    owner: { login: owner },
    html_url: `https://github.com/${fullName}`,
    description: null,
    private: false,
    archived: false,
    default_branch: 'main',
    pushed_at: '2026-10-01T00:00:00Z',
    ...over,
  };
}

export function ghCommit(
  sha: string,
  message = 'feat: something\n\nbody',
): GhCommit {
  return {
    sha,
    commit: {
      message,
      author: { name: 'Ada', date: '2026-10-01T10:00:00Z' },
      committer: { date: '2026-10-01T10:00:00Z' },
    },
    author: { login: 'ada' },
  };
}

export function ghPull(
  id: number,
  over: Partial<GhPullRequest> = {},
): GhPullRequest {
  return {
    id,
    number: id,
    state: 'open',
    title: `PR ${id}`,
    draft: false,
    html_url: `https://github.com/acme/api/pull/${id}`,
    user: { login: 'ada' },
    labels: [],
    base: { ref: 'main' },
    head: { ref: `feature-${id}`, sha: `sha-pr-${id}` },
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-02T00:00:00Z',
    ...over,
  };
}

export function ghRun(
  id: number,
  over: Partial<GhWorkflowRun> = {},
): GhWorkflowRun {
  return {
    id,
    workflow_id: 1,
    name: 'CI',
    event: 'push',
    head_branch: 'main',
    head_sha: 'sha-main',
    status: 'completed',
    conclusion: 'success',
    run_number: id,
    run_attempt: 1,
    html_url: `https://github.com/acme/api/actions/runs/${id}`,
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:05:00Z',
    ...over,
  };
}

export function ghRelease(
  id: number,
  tag: string,
  over: Partial<GhRelease> = {},
): GhRelease {
  return {
    id,
    tag_name: tag,
    name: tag,
    draft: false,
    prerelease: false,
    html_url: `https://github.com/acme/api/releases/tag/${tag}`,
    author: { login: 'ada' },
    published_at: '2026-09-30T00:00:00Z',
    created_at: '2026-09-30T00:00:00Z',
    ...over,
  };
}

export function repoState(
  over: Partial<FakeRepoState> & { repo: GhRepository },
): FakeRepoState {
  return {
    commit: ghCommit('sha-main'),
    pulls: [[]],
    runs: [],
    releases: [],
    tags: [],
    ...over,
  };
}

export function ghInstallation(
  id: number,
  login: string,
  over: Partial<GhInstallation> = {},
): GhInstallation {
  return {
    id,
    account: { id: id * 10, login, type: 'User' },
    repository_selection: 'all',
    suspended_at: null,
    ...over,
  };
}
