import { defineEventHandler, getQuery } from 'h3';
import { db } from '../../../../db';
import { guarded } from '../../../../lib/automation/http';
import { listPromptSummaries } from '../../../../lib/automation/service';
import { parsePromptFilter } from '../../../../lib/automation/validate';
import { requireAllowedUser } from '../../../../lib/http';

/** GET /api/v1/prompts?repositoryId=&status=active|unread|read|dismissed — the caller's Prompt Inbox. */
export default defineEventHandler(async (event) => {
  const user = await requireAllowedUser(event);
  return guarded(() =>
    listPromptSummaries(db, user.id, parsePromptFilter(getQuery(event))),
  );
});
