import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { db } from '../../../../db';
import { guarded } from '../../../../lib/automation/http';
import { updatePromptStatus } from '../../../../lib/automation/service';
import {
  parsePromptId,
  parsePromptStatus,
} from '../../../../lib/automation/validate';
import {
  assertSameOriginJson,
  enforceRateLimit,
  requireAllowedUser,
} from '../../../../lib/http';

/** PATCH /api/v1/prompts/:id { status: unread | read | dismissed } */
export default defineEventHandler(async (event) => {
  const user = await requireAllowedUser(event);
  assertSameOriginJson(event);
  await enforceRateLimit(event, 'PREFERENCES_RATE_LIMITER', user.id);

  const body = await readBody(event);
  return guarded(async () => {
    const id = parsePromptId(getRouterParam(event, 'id'));
    const status = parsePromptStatus(body);
    await updatePromptStatus(db, user.id, id, status);
    return { id, status };
  });
});
