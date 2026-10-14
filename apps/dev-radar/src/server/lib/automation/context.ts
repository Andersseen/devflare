import type { GateResult } from '../../../shared/automation';
import type {
  ContextCiState,
  DocumentExcerpt,
  DocumentRole,
  MissingItem,
  RepositoryContext,
} from '../../../shared/prompt-context';
import type { GitHubApi } from '../github/api';
import { GitHubApiError, GitHubRateLimitError } from '../github/errors';
import type { GhContentEntry } from '../github/types';

/**
 * The bounded, read-only snapshot a prompt is built from (spec 023).
 *
 * Everything here is *data about* a repository — repository text (README,
 * commit messages, PR bodies) is untrusted and is only ever stored and quoted,
 * never interpreted. Bounds: at most 4 documents of ≤ 6 000 characters, files
 * over 256 KB are not downloaded, 10 recent commits, 30 changed paths, and
 * roughly a dozen read calls in total.
 */

export const CONTEXT_LIMITS = {
  maxDocuments: 4,
  maxFileBytes: 256_000,
  excerptChars: { agents: 6000, readme: 6000, roadmap: 4000, specs: 3000 },
  recentCommits: 10,
  changedPaths: 30,
  messageChars: 160,
  prBodyChars: 600,
} as const;

export type {
  ContextCiState,
  DocumentExcerpt,
  DocumentRole,
  MissingItem,
  RepositoryContext,
} from '../../../shared/prompt-context';

// ---- sanitizing untrusted text -----------------------------------------------

/** C0 controls except tab/newline, DEL, and the Unicode line/paragraph separators. */
function isControl(code: number): boolean {
  return (
    (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) ||
    code === 0x7f ||
    code === 0x2028 ||
    code === 0x2029
  );
}

const stripControls = (text: string, replacement: string): string =>
  Array.from(text, (char) =>
    isControl(char.charCodeAt(0)) ? replacement : char,
  ).join('');

/** Strips control characters, normalizes newlines, caps the length. */
export function cleanText(
  raw: string,
  max: number,
): { text: string; truncated: boolean } {
  const text = stripControls(raw.replace(/\r\n?/g, '\n'), '');
  return text.length > max
    ? { text: text.slice(0, max), truncated: true }
    : { text, truncated: false };
}

/** One line, collapsed whitespace, capped — for titles and commit subjects. */
export function oneLine(raw: string | null | undefined, max: number): string {
  const collapsed = stripControls(raw ?? '', ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return collapsed.length > max ? `${collapsed.slice(0, max - 1)}…` : collapsed;
}

export function decodeBase64Utf8(content: string): string {
  const binary = atob(content.replace(/\s+/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

// ---- which documents ---------------------------------------------------------

export interface DocCandidate {
  path: string;
  role: DocumentRole;
  size: number;
}

const byName = (entries: readonly GhContentEntry[] | null, pattern: RegExp) =>
  (entries ?? []).find((e) => e.type === 'file' && pattern.test(e.name));

/**
 * Picks the documents worth reading from the root listing and, when there is
 * one, the `docs/` listing. Generic on purpose: an agent guide, the README, a
 * roadmap, and a specs index if the repository keeps one. Order is priority.
 */
export function selectDocuments(
  root: readonly GhContentEntry[] | null,
  docs: readonly GhContentEntry[] | null,
): { candidates: DocCandidate[]; specsIndexPath: string | null } {
  const candidates: DocCandidate[] = [];
  const add = (entry: GhContentEntry | undefined, role: DocumentRole) => {
    if (entry) {
      candidates.push({ path: entry.path, role, size: entry.size });
    }
  };

  add(byName(root, /^agents\.md$/i), 'agents');
  add(byName(root, /^readme(\.(md|markdown|rst|txt))?$/i), 'readme');
  add(
    byName(root, /^roadmap(\.(md|markdown|rst|txt))?$/i) ??
      byName(docs, /^roadmap(\.(md|markdown|rst|txt))?$/i),
    'roadmap',
  );

  const specsDir = (docs ?? []).find(
    (e) => e.type === 'dir' && e.name.toLowerCase() === 'specs',
  );
  return {
    candidates,
    specsIndexPath: specsDir ? `${specsDir.path}/README.md` : null,
  };
}

// ---- collecting --------------------------------------------------------------

/** Statuses that mean "GitHub will not tell us this", not "GitHub is broken". */
const SOFT = new Set([403, 404, 409, 410, 451]);

async function soft<T>(
  missing: MissingItem[],
  what: string,
  read: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (
      error instanceof GitHubApiError &&
      !(error instanceof GitHubRateLimitError) &&
      SOFT.has(error.status)
    ) {
      missing.push({ what, reason: `GitHub answered ${error.status}` });
      return fallback;
    }
    // Rate limits, exhausted budgets and network/5xx failures are the caller's
    // to retry; they must not produce a half-empty prompt.
    throw error;
  }
}

export interface CollectInput {
  api: GitHubApi;
  token: string;
  repository: RepositoryContext['repository'];
  branch: string;
  sha: string;
  headMessage: string | null;
  pushCommits: number | null;
  ci: { gate: GateResult; bypassed: boolean };
  now: Date;
}

function ciSnapshot(
  gate: GateResult,
  bypassed: boolean,
): RepositoryContext['ci'] {
  const state: ContextCiState =
    gate.verdict === 'pass'
      ? 'success'
      : gate.workflows.some((w) => w.state === 'failed')
        ? 'failure'
        : gate.workflows.length === 0
          ? 'none'
          : 'pending';
  return {
    state,
    bypassed,
    detail: gate.detail,
    workflows: gate.workflows.map((w) => ({
      name: oneLine(w.name, 80),
      outcome: w.outcome,
      url: w.url,
    })),
  };
}

export async function collectContext(
  input: CollectInput,
): Promise<RepositoryContext> {
  const { api, token, repository, sha } = input;
  const name = repository.fullName;
  const missing: MissingItem[] = [];

  // Commit detail: changed paths.
  const detail = await soft(
    missing,
    'Changed files',
    () => api.getCommit(token, name, sha),
    null,
  );
  const files = detail?.files ?? null;
  const changedFiles = files
    ? {
        paths: files
          .slice(0, CONTEXT_LIMITS.changedPaths)
          .map((f) => oneLine(f.filename, 200)),
        total: files.length,
      }
    : null;
  if (!changedFiles && detail) {
    missing.push({
      what: 'Changed files',
      reason: 'GitHub returned no file list for the commit',
    });
  }

  // Recent history.
  const history = await soft(
    missing,
    'Recent commits',
    () => api.listCommits(token, name, sha, CONTEXT_LIMITS.recentCommits),
    [],
  );
  const recentCommits = history.map((c) => ({
    sha: c.sha,
    message: oneLine(
      c.commit.message.split('\n')[0],
      CONTEXT_LIMITS.messageChars,
    ),
    author: c.author?.login ?? c.commit.author?.name ?? null,
    date: c.commit.author?.date ?? null,
  }));

  // The merged PR GitHub associates with the head commit, if any.
  const pulls = await soft(
    missing,
    'Associated pull request',
    () => api.listCommitPullRequests(token, name, sha),
    [],
  );
  const merged = pulls.find(
    (p) => p.merged_at !== null && p.base.ref === input.branch,
  );
  if (!merged) {
    missing.push({
      what: 'Latest merged pull request',
      reason: 'GitHub reports no merged pull request for this commit',
    });
  }
  const latestPullRequest = merged
    ? {
        number: merged.number,
        title: oneLine(merged.title, 200),
        url: merged.html_url,
        author: merged.user?.login ?? null,
        mergedAt: merged.merged_at as string,
        body: merged.body
          ? cleanText(merged.body, CONTEXT_LIMITS.prBodyChars).text
          : null,
      }
    : null;

  // Documentation.
  const root = await soft(
    missing,
    'Repository root listing',
    () => api.listDirectory(token, name, '', sha),
    null,
  );
  const hasDocsDir = (root ?? []).some(
    (e) => e.type === 'dir' && e.name.toLowerCase() === 'docs',
  );
  const docsEntries = hasDocsDir
    ? await soft(
        missing,
        'docs/ listing',
        () => api.listDirectory(token, name, 'docs', sha),
        null,
      )
    : null;
  const { candidates, specsIndexPath } = selectDocuments(root, docsEntries);

  if (root && !candidates.some((c) => c.role === 'readme')) {
    missing.push({
      what: 'README',
      reason: 'No README in the repository root',
    });
  }
  if (root && !candidates.some((c) => c.role === 'agents')) {
    missing.push({
      what: 'AGENTS.md',
      reason: 'No AGENTS.md in the repository root',
    });
  }
  if (root && !candidates.some((c) => c.role === 'roadmap')) {
    missing.push({
      what: 'Roadmap',
      reason: 'No ROADMAP file in the root or docs/',
    });
  }

  const wanted: { path: string; role: DocumentRole; size: number | null }[] = [
    ...candidates,
    ...(specsIndexPath
      ? [{ path: specsIndexPath, role: 'specs' as const, size: null }]
      : []),
  ].slice(0, CONTEXT_LIMITS.maxDocuments);

  const documents: DocumentExcerpt[] = [];
  for (const doc of wanted) {
    if (doc.size !== null && doc.size > CONTEXT_LIMITS.maxFileBytes) {
      missing.push({
        what: doc.path,
        reason: `Too large to read (${doc.size} bytes; limit ${CONTEXT_LIMITS.maxFileBytes})`,
      });
      continue;
    }
    const file = await soft(
      missing,
      doc.path,
      () => api.getFile(token, name, doc.path, sha),
      null,
    );
    if (!file) {
      if (doc.role !== 'specs') {
        missing.push({ what: doc.path, reason: 'Could not be read' });
      }
      continue;
    }
    if (file.size > CONTEXT_LIMITS.maxFileBytes || !file.content) {
      missing.push({
        what: doc.path,
        reason: `Too large to read (${file.size} bytes; limit ${CONTEXT_LIMITS.maxFileBytes})`,
      });
      continue;
    }
    const decoded = decodeBase64Utf8(file.content);
    const excerpt = cleanText(decoded, CONTEXT_LIMITS.excerptChars[doc.role]);
    documents.push({
      path: doc.path,
      role: doc.role,
      size: file.size,
      truncated: excerpt.truncated,
      text: excerpt.text,
    });
  }

  return {
    schema: 1,
    collectedAt: input.now.toISOString(),
    repository: {
      ...repository,
      description: repository.description
        ? oneLine(repository.description, 300)
        : null,
    },
    branch: input.branch,
    sha,
    headMessage: input.headMessage
      ? oneLine(input.headMessage, CONTEXT_LIMITS.messageChars)
      : null,
    pushCommits: input.pushCommits,
    ci: ciSnapshot(input.ci.gate, input.ci.bypassed),
    latestPullRequest,
    recentCommits,
    changedFiles,
    documents,
    missing,
  };
}
