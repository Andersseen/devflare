import { defineEventHandler, getRouterParam } from 'h3';
import { db } from '../../../../db';
import { guarded } from '../../../../lib/automation/http';
import { getPromptDetail } from '../../../../lib/automation/service';
import { parsePromptId } from '../../../../lib/automation/validate';
import { requireAllowedUser } from '../../../../lib/http';

/** GET /api/v1/prompts/:id — the full prompt and its context snapshot (own prompts only). */
export default defineEventHandler(async (event) => {
  const user = await requireAllowedUser(event);
  return guarded(() =>
    getPromptDetail(db, user.id, parsePromptId(getRouterParam(event, 'id'))),
  );
});
