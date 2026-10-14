import type { PromptStatus, RunTrigger } from '../../../shared/automation';
import type { Rows, SqlDatabase } from '../../db';

/** Development prompts (spec 023): the Prompt Inbox's rows. User-scoped in SQL. */

export interface PromptRow {
  id: string;
  user_id: string;
  repository_id: number;
  repository_full_name: string;
  run_id: string | null;
  branch: string;
  sha: string;
  trigger: RunTrigger;
  ci_bypassed: number;
  revision: number;
  ci_state: string;
  summary: string;
  prompt: string;
  context: string;
  status: PromptStatus;
  created_at: string;
  read_at: string | null;
}

export type PromptListRow = Omit<PromptRow, 'prompt' | 'context'>;

export const PROMPTS_KEPT_PER_USER = 100;

export interface NewPrompt {
  userId: string;
  repositoryId: number;
  repositoryFullName: string;
  runId: string;
  branch: string;
  sha: string;
  trigger: RunTrigger;
  ciBypassed: boolean;
  ciState: string;
  summary: string;
  prompt: string;
  context: string;
}

/**
 * Stores a prompt and returns its id. Automatic prompts are idempotent: the
 * unique (user, repository, sha) / run indexes mean a retry returns the
 * prompt that already exists. A manual prompt is a new revision of its commit.
 */
export async function insertPrompt(
  db: SqlDatabase,
  prompt: NewPrompt,
  now: Date = new Date(),
): Promise<string> {
  const id = crypto.randomUUID();
  const stamp = now.toISOString();
  await db.sql`INSERT OR IGNORE INTO development_prompt
      (id, user_id, repository_id, repository_full_name, run_id, branch, sha, trigger,
       ci_bypassed, revision, ci_state, summary, prompt, context, status, created_at)
    VALUES (${id}, ${prompt.userId}, ${prompt.repositoryId}, ${prompt.repositoryFullName},
      ${prompt.runId}, ${prompt.branch}, ${prompt.sha}, ${prompt.trigger},
      ${prompt.ciBypassed ? 1 : 0},
      COALESCE((SELECT MAX(revision) FROM development_prompt
        WHERE user_id = ${prompt.userId} AND repository_id = ${prompt.repositoryId}
          AND sha = ${prompt.sha}), 0) + 1,
      ${prompt.ciState}, ${prompt.summary}, ${prompt.prompt}, ${prompt.context}, 'unread', ${stamp})`;

  const stored = await db.sql<
    Rows<{ id: string }>
  >`SELECT id FROM development_prompt
    WHERE (id = ${id}) OR (run_id = ${prompt.runId})
       OR (${prompt.trigger} = 'automatic' AND user_id = ${prompt.userId}
           AND repository_id = ${prompt.repositoryId} AND sha = ${prompt.sha}
           AND trigger = 'automatic')
    ORDER BY created_at LIMIT 1`;
  const found = stored.rows?.[0]?.id;
  if (!found) throw new Error('prompt was not stored');
  return found;
}

export async function getPrompt(
  db: SqlDatabase,
  userId: string,
  id: string,
): Promise<PromptRow | null> {
  const result = await db.sql<Rows<PromptRow>>`SELECT * FROM development_prompt
    WHERE id = ${id} AND user_id = ${userId}`;
  return result.rows?.[0] ?? null;
}

export async function listPrompts(
  db: SqlDatabase,
  userId: string,
  filter: {
    repositoryId?: number;
    status?: PromptStatus | 'active';
    limit: number;
  },
): Promise<PromptListRow[]> {
  const repositoryId = filter.repositoryId ?? null;
  // 'active' = everything not dismissed, the inbox's default view.
  const status = filter.status ?? 'active';
  const result = await db.sql<
    Rows<PromptListRow>
  >`SELECT id, user_id, repository_id, repository_full_name, run_id, branch, sha, trigger,
      ci_bypassed, revision, ci_state, summary, status, created_at, read_at
    FROM development_prompt
    WHERE user_id = ${userId}
      AND (${repositoryId} IS NULL OR repository_id = ${repositoryId})
      AND ((${status} = 'active' AND status != 'dismissed') OR status = ${status})
    ORDER BY created_at DESC, id DESC LIMIT ${filter.limit}`;
  return result.rows ?? [];
}

export async function countUnreadPrompts(
  db: SqlDatabase,
  userId: string,
): Promise<number> {
  const result = await db.sql<Rows<{ total: number }>>`SELECT COUNT(*) AS total
    FROM development_prompt WHERE user_id = ${userId} AND status = 'unread'`;
  return result.rows?.[0]?.total ?? 0;
}

export async function setPromptStatus(
  db: SqlDatabase,
  userId: string,
  id: string,
  status: PromptStatus,
  now: Date = new Date(),
): Promise<boolean> {
  const readAt = status === 'unread' ? null : now.toISOString();
  await db.sql`UPDATE development_prompt SET status = ${status},
      read_at = ${readAt} WHERE id = ${id} AND user_id = ${userId}`;
  return (await getPrompt(db, userId, id))?.status === status;
}

/** At most 100 prompts per user: the oldest beyond that are dropped. */
export async function prunePrompts(
  db: SqlDatabase,
  userId: string,
): Promise<void> {
  await db.sql`DELETE FROM development_prompt WHERE user_id = ${userId} AND id NOT IN (
    SELECT id FROM development_prompt WHERE user_id = ${userId}
    ORDER BY created_at DESC, id DESC LIMIT ${PROMPTS_KEPT_PER_USER})`;
}
